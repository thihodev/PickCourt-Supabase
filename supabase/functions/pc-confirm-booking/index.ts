import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import { BookingOperationsService } from '../../../src/services/BookingOperationsService.ts'
import { BookingValidationService } from '../../../src/services/BookingValidationService.ts'
import { TeamService } from '../../../src/services/TeamService.ts'
import { MatchService } from '../../../src/services/MatchService.ts'
import { PaymentService } from '../../../src/services/PaymentService.ts'

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
    const requestData: ConfirmBookingRequest = await req.json()

    // Basic validation
    if (!requestData.booking_id) {
      return createErrorResponse('Missing required fields: booking_id', 400)
    }

    const supabase = createAuthenticatedClient(req)
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Initialize services
    const bookingService = new BookingOperationsService()
    const validationService = new BookingValidationService()
    const teamService = new TeamService()
    const matchService = new MatchService()
    const paymentService = new PaymentService()

    // Get booking details
    const booking = await bookingService.getBookingWithDetails(requestData.booking_id)

    // Validate booking can be confirmed
    validationService.validateBookingForConfirmation({
      booking,
      userId: requestData.user_id,
      userRole: 'user',
      tenantId: booking.club?.tenant_id || ''
    })

    // Update booking to confirmed
    const updatedBooking = await bookingService.updateBookingStatus({
      bookingId: requestData.booking_id,
      status: 'confirmed',
      userId: requestData.user_id,
      metadata: {
        ...booking.metadata,
        confirmation_notes: requestData.notes,
        payment_method: requestData.payment_method,
        payment_reference: requestData.payment_reference
      }
    })

    // Remove reserved slots from cache - handle both single and recurring bookings
    if (booking.booking_type === 'recurring') {
      // For recurring bookings, we need to remove reserved slots for all dates
      const { data: bookedSlots } = await supabase
        .from('booked_slots')
        .select('start_time')
        .eq('booking_id', requestData.booking_id)
      
      if (bookedSlots) {
        for (const slot of bookedSlots) {
          await bookingService.removeAllReservedSlotsForBooking(
            booking.club_id,
            requestData.booking_id,
            slot.start_time
          )
        }
      }
    } else {
      // Single booking - original logic
      await bookingService.removeAllReservedSlotsForBooking(
        booking.club_id,
        requestData.booking_id,
        booking.start_time
      )
    }

    // Update booked_slots status to confirmed
    const updatedSlots = await bookingService.updateBookedSlotsStatus({
      bookingId: requestData.booking_id,
      status: 'confirmed'
    })

    // Add confirmed slots to Upstash Redis cache
    await bookingService.addSlotsToUpstash(booking.club_id, updatedSlots, requestData.booking_id)

    // Create teams and matches for each booked slot (only for bookings with user_id)
    let matchesCreated = 0
    let teamsCreated = 0
    if (booking.user_id) {
      try {
        for (const slot of updatedSlots) {
          // Create teams for this specific slot (each slot gets its own match)
          const teams = await teamService.createTeamsForBooking({
            tenantId: booking.club?.tenant_id || '',
            bookingId: requestData.booking_id,
            courtName: `${booking.metadata?.court_name || 'Court'} - ${new Date(slot.start_time).toLocaleDateString()}`,
            customerId: booking.user_id,
            createdBy: requestData.user_id
          })

          // Create match for this specific slot
          const createdMatch = await matchService.createMatch({
            bookingId: requestData.booking_id,
            teamOneId: teams.teamOne.id,
            teamTwoId: teams.teamTwo.id,
            matchDate: slot.start_time,
            courtId: slot.court_id,
            courtName: booking.metadata?.court_name || '',
            clubName: booking.metadata?.club_name || '',
            createdBy: requestData.user_id
          })

          // Update the booked_slot with the match_id
          await supabase
            .from('booked_slots')
            .update({ match_id: createdMatch.id })
            .eq('id', slot.id)

          matchesCreated++
          teamsCreated += 2 // Two teams per match
        }
      } catch (error) {
        console.error('Error creating teams/matches:', error)
        // Don't fail the entire operation if teams/matches creation fails
      }
    } else {
      console.log('Skipping match creation for guest booking (no user_id)')
    }

    // Create payment record (default to pay_at_club)
    const paymentMethod = requestData.payment_method || 'pay_at_club'
    const isPayAtClub = paymentMethod === 'pay_at_club'
    
    let createdPayment = null
    try {
      createdPayment = await paymentService.createPayment({
        bookingId: requestData.booking_id,
        amount: booking.total_amount,
        paymentMethod: paymentMethod,
        transactionId: requestData.payment_reference || `booking_${requestData.booking_id}_${Date.now()}`,
        tenantId: booking.club?.tenant_id || '',
        confirmedBy: user.id,
        isPayAtClub: isPayAtClub
      })
    } catch (error) {
      console.error('Error creating payment:', error)
      // Don't fail the entire operation if payment creation fails
    }


    // Return success response
    return createResponse({
      ...updatedBooking,
      message: `${booking.booking_type === 'recurring' ? 'Recurring booking' : 'Booking'} confirmed successfully`,
      matches_created: matchesCreated,
      teams_created: teamsCreated,
      slots_processed: updatedSlots.length,
      booking_type: booking.booking_type,
      payment_method: paymentMethod,
      payment_status: createdPayment?.status || (isPayAtClub ? 'pending' : 'completed'),
      slots_summary: updatedSlots.map(slot => ({
        slot_id: slot.id,
        start_time: slot.start_time,
        end_time: slot.end_time,
        price: slot.price,
        status: slot.status
      }))
    })

  } catch (error) {
    console.error('Error in confirm-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})