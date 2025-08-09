import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createSupabaseAdminClient,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import { UpstashBookedSlotService } from '../../../src/services/UpstashBookedSlotService.ts'

interface ConfirmBookingRequest {
  booking_id: string
  user_id: string  // Required in payload
  payment_method?: string
  payment_reference?: string
  notes?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    // Parse request body
    const requestData: ConfirmBookingRequest = await req.json()

    // Basic validation
    if (!requestData.booking_id || !requestData.user_id) {
      return createErrorResponse('Missing required fields: booking_id, user_id', 400)
    }

    const supabase = createAuthenticatedClient(req)
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }
    const upstashService = new UpstashBookedSlotService()

    // 1. Get booking with booked_slots and club details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        club_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        club:clubs(
          id,
          tenant_id
        ),
        booked_slots(
          id,
          court_id,
          start_time,
          end_time,
          status,
          price,
          metadata
        )
      `)
      .eq('id', requestData.booking_id)
      .single()

    if (bookingError || !booking) {
      return createErrorResponse('Booking not found', 404)
    }

    // 2. Simple validation
    if (booking.status === 'confirmed') {
      return createErrorResponse('Booking is already confirmed', 400)
    }

    if (booking.status === 'cancelled') {
      return createErrorResponse('Cannot confirm a cancelled booking', 400)
    }

    // 3. Update booking to confirmed
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
        metadata: {
          ...booking.metadata,
          confirmed_at: new Date().toISOString(),
          confirmed_by: requestData.user_id,
          confirmation_notes: requestData.notes,
          payment_method: requestData.payment_method,
          payment_reference: requestData.payment_reference
        }
      })
      .eq('id', requestData.booking_id)
      .select()
      .single()

    if (updateError) {
      return createErrorResponse(updateError.message, 400)
    }

    // 4. Update booked_slots status to confirmed
    const { data: updatedSlots, error: slotsUpdateError } = await supabase
      .from('booked_slots')
      .update({ 
        status: 'confirmed'
      })
      .eq('booking_id', requestData.booking_id)
      .select()

    if (slotsUpdateError) {
      console.error('Error updating booked slots:', slotsUpdateError)
      return createErrorResponse('Failed to update booked slots', 400)
    }

    // 4.1. Add slots to Upstash Redis cache
    try {
      for (const slot of updatedSlots || []) {
        const dateKey = new Date(slot.start_time).toISOString().split('T')[0]
        await upstashService.addBookedSlot(booking.club_id, dateKey, {
          courtId: slot.court_id,
          startTime: slot.start_time,
          endTime: slot.end_time,
          bookingId: requestData.booking_id,
          slotId: slot.id
        })
      }
    } catch (upstashError) {
      console.error('Error adding slots to Upstash:', upstashError)
      // Don't fail the entire operation if Upstash fails
    }

    // 5. Create teams first for each booked slot
    const teamsToCreate = []
    for (const slot of updatedSlots || []) {
      // Create Team 1 with booking user as player 1
      teamsToCreate.push({
        name: 'Team 1',
        player_one_id: booking.user_id,
        player_two_id: null,
        metadata: {
          created_from_booking: true,
          booking_id: requestData.booking_id,
          slot_id: slot.id,
          team_number: 1
        }
      })
      
      // Create Team 2 (empty for now, using booking user for both slots temporarily)
      teamsToCreate.push({
        name: 'Team 2', 
        player_one_id: null,
        player_two_id: null,
        metadata: {
          created_from_booking: true,
          booking_id: requestData.booking_id,
          slot_id: slot.id,
          team_number: 2
        }
      })
    }

    let createdTeams = []
    if (teamsToCreate.length > 0) {
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .insert(teamsToCreate)
        .select('id, metadata')

      if (teamsError) {
        console.error('Error creating teams:', teamsError)
      } else {
        createdTeams = teams || []
      }
    }

    // 6. Create matches for each booked slot with team references
    const matchesToCreate = []
    for (let i = 0; i < (updatedSlots || []).length; i++) {
      const slot = updatedSlots[i]
      const team1Index = i * 2
      const team2Index = i * 2 + 1
      
      if (createdTeams[team1Index] && createdTeams[team2Index]) {
        matchesToCreate.push({
          booking_id: requestData.booking_id,
          team_one_id: createdTeams[team1Index].id,
          team_two_id: createdTeams[team2Index].id,
          status: 'scheduled',
          match_date: slot.start_time,
          duration_minutes: Math.round((new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / (1000 * 60)),
          metadata: {
            created_from_booking: true,
            booked_slot_id: slot.id,
            created_by: requestData.user_id,
            court_id: slot.court_id
          }
        })
      }
    }

    if (matchesToCreate.length > 0) {
      const { data: createdMatches, error: matchError } = await supabase
        .from('matches')
        .insert(matchesToCreate)
        .select('id')

      if (matchError) {
        console.error('Error creating matches:', matchError)
        // Don't fail the entire operation if match creation fails
      } else if (createdMatches && createdMatches.length > 0) {
        // 7. Update booked_slots with match_id
        for (let i = 0; i < createdMatches.length; i++) {
          const match = createdMatches[i]
          const slot = updatedSlots[i]
          
          await supabase
            .from('booked_slots')
            .update({ match_id: match.id })
            .eq('id', slot.id)
        }
      }
    }

    // 8. Create payment record (default to pay_at_club)
    const paymentMethod = requestData.payment_method || 'pay_at_club'
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        tenant_id: booking.club?.tenant_id, // Get tenant_id from club relationship
        booking_id: requestData.booking_id,
        amount: booking.total_amount,
        payment_method: paymentMethod,
        transaction_id: requestData.payment_reference || `booking_${requestData.booking_id}_${Date.now()}`,
        status: paymentMethod === 'pay_at_club' ? 'pending' : 'paid',
        paid_at: paymentMethod !== 'pay_at_club' ? new Date().toISOString() : null,
        metadata: {
          confirmed_with_booking: true,
          confirmed_by: requestData.user_id,
          confirmed_at: new Date().toISOString(),
          notes: requestData.notes
        }
      })

    if (paymentError) {
      console.error('Error creating payment:', paymentError)
      // Don't fail the entire operation if payment creation fails
    }

    // 9. Update booking payment status if using pay_at_club
    if (paymentMethod === 'pay_at_club') {
      await supabase
        .from('bookings')
        .update({
          payment_status: 'unpaid',
          payment_method: 'pay_at_club'
        })
        .eq('id', requestData.booking_id)
    } else {
      await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          payment_method: paymentMethod
        })
        .eq('id', requestData.booking_id)
    }

    // 10. Return success response
    return createResponse({
      ...updatedBooking,
      message: 'Booking confirmed successfully',
      matches_created: matchesToCreate.length,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'pay_at_club' ? 'pending' : 'completed'
    })

  } catch (error) {
    console.error('Error in confirm-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})