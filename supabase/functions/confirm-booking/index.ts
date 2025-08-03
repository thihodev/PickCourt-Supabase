import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

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

    // 1. Get booking
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
        updated_at
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

    // 4. Create payment record if provided (no tenant_id needed)
    if (requestData.payment_method && requestData.payment_reference) {
      await supabase
        .from('payments')
        .insert({
          booking_id: requestData.booking_id,
          amount: booking.total_amount,
          payment_method: requestData.payment_method,
          transaction_id: requestData.payment_reference,
          status: 'completed',
          metadata: {
            confirmed_with_booking: true,
            confirmed_by: requestData.user_id,
            confirmed_at: new Date().toISOString()
          }
        })
    }

    // 5. Update booked_slots status to confirmed
    await supabase
      .from('booked_slots')
      .update({ status: 'confirmed' })
      .eq('booking_id', requestData.booking_id)

    // 5. Return success response
    return createResponse(updatedBooking)

  } catch (error) {
    console.error('Error in confirm-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})