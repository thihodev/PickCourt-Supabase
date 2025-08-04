import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  requireAuth,
  corsHeaders,
  createSupabaseAdminClient,
  createAuthenticatedClient
} from '../_shared/utils.ts'

interface CancelBookingRequest {
  booking_id: string
  reason?: string
  refund_amount?: number
  notes?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    const requestData: CancelBookingRequest = await req.json()

    if (!requestData.booking_id) {
      return createErrorResponse('Missing required field: booking_id', 400)
    }


    const supabase = createAuthenticatedClient(req)
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Get booking with court and club info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select()
      .eq('id', requestData.booking_id)
      .single()

    if (bookingError || !booking) {
      console.log(bookingError);
      return createErrorResponse('Booking not found', 404)
    }

    // Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      return createErrorResponse('Booking is already cancelled', 400)
    }

    if (booking.status === 'completed') {
      return createErrorResponse('Cannot cancel a completed booking', 400)
    }

    // Check cancellation policy (example: can cancel up to 2 hours before)
    const startTime = new Date(booking.start_time)
    const now = new Date()
    const timeDiffHours = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60)


    // Determine refund amount
    let refundAmount: number
    if (requestData.refund_amount !== undefined) {
      refundAmount = Math.max(0, Math.min(requestData.refund_amount, booking.total_amount))
    } else {
      // Auto-calculate refund based on policy
      if (timeDiffHours >= 24) {
        refundAmount = booking.total_amount // Full refund
      } else if (timeDiffHours >= 2) {
        refundAmount = Math.round(booking.total_amount * 0.5) // 50% refund
      } else {
        refundAmount = 0 // No refund
      }
    }

    const now_iso = now.toISOString()

    // Update booking status to cancelled
    const updateData = {
      status: 'cancelled',
      updated_at: now_iso,
      metadata: {
        ...booking.metadata,
        cancelled_at: now_iso,
        cancellation_reason: requestData.reason,
        cancellation_notes: requestData.notes,
        refund_amount: refundAmount,
        original_amount: booking.total_amount,
        time_before_start_hours: Math.round(timeDiffHours * 100) / 100
      }
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', requestData.booking_id)
      .select()
      .single()

    if (updateError) {
      return createErrorResponse(updateError.message, 400)
    }

    // Cancel all booked slots for this booking
    const { error: bookedSlotsError } = await supabase
      .from('booked_slots')
      .update({
        status: 'cancelled',
        updated_at: now_iso,
        metadata: {
          cancelled_at: now_iso,
          cancelled_by: user.id,
          cancellation_reason: requestData.reason,
          cancellation_notes: requestData.notes
        }
      })
      .eq('booking_id', requestData.booking_id)

    if (bookedSlotsError) {
      console.error('Error cancelling booked slots:', bookedSlotsError)
    }

    // Cancel all matches for this booking
    const { error: matchesError } = await supabase
      .from('matches')
      .update({
        status: 'cancelled',
        updated_at: now_iso,
        metadata: {
          cancelled_at: now_iso,
          cancelled_by: user.id,
          cancellation_reason: requestData.reason,
          cancellation_notes: requestData.notes
        }
      })
      .eq('booking_id', requestData.booking_id)

    if (matchesError) {
      console.error('Error cancelling matches:', matchesError)
    }

    // Create refund payment record if applicable
    if (refundAmount > 0) {
      const refundData = {
        booking_id: requestData.booking_id,
        amount: -refundAmount, // Negative amount for refund
        payment_method: 'refund',
        status: 'pending', // Admin needs to process refund
        metadata: {
          refund_for_cancellation: true,
          cancelled_at: now_iso,
          original_amount: booking.total_amount,
          refund_reason: requestData.reason
        }
      }

      await supabase
        .from('payments')
        .insert(refundData)
    }

    // Return cancelled booking with court info and refund details
    const responseData = {
      ...updatedBooking,
      refund_info: {
        refund_amount: refundAmount,
        refund_percentage: Math.round((refundAmount / booking.total_amount) * 100),
        time_before_start_hours: Math.round(timeDiffHours * 100) / 100
      }
    }

    return createResponse(responseData)

  } catch (error) {
    console.error('Error in cancel-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})