import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import { BookingOperationsService } from '../../../src/services/BookingOperationsService.ts'
import { BookingCancellationService } from '../../../src/services/BookingCancellationService.ts'

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

    // Initialize services
    const bookingService = new BookingOperationsService()
    const cancellationService = new BookingCancellationService()

    // Get booking details
    const booking = await bookingService.getBookingWithDetails(requestData.booking_id)

    // Validate cancellation is allowed
    await cancellationService.validateCancellation(booking)

    // Calculate refund
    const refundResult = cancellationService.calculateRefund({
      startTime: booking.start_time,
      totalAmount: booking.total_amount,
      customRefundAmount: requestData.refund_amount
    })

    // Update booking status to cancelled
    const updatedBooking = await bookingService.updateBookingStatus({
      bookingId: requestData.booking_id,
      status: 'cancelled',
      userId: user.id,
      metadata: {
        ...booking.metadata,
        cancellation_reason: requestData.reason,
        cancellation_notes: requestData.notes,
        refund_amount: refundResult.refundAmount,
        original_amount: booking.total_amount,
        time_before_start_hours: refundResult.timeBeforeStartHours
      }
    })

    // Cancel all booked slots
    await bookingService.updateBookedSlotsStatus({
      bookingId: requestData.booking_id,
      status: 'cancelled',
      metadata: {
        cancelled_by: user.id,
        cancellation_reason: requestData.reason,
        cancellation_notes: requestData.notes
      }
    })

    // Remove slots from Upstash Redis cache
    await bookingService.removeSlotsFromUpstash(booking.club_id, booking.booked_slots || [])

    // Cancel all matches for this booking
    await cancellationService.cancelMatches({
      bookingId: requestData.booking_id,
      userId: user.id,
      reason: requestData.reason,
      notes: requestData.notes
    })

    // Create refund payment record if applicable
    await cancellationService.createRefundRecord({
      bookingId: requestData.booking_id,
      refundAmount: refundResult.refundAmount,
      originalAmount: booking.total_amount,
      reason: requestData.reason
    })

    // Return cancelled booking with refund details
    const responseData = {
      ...updatedBooking,
      refund_info: {
        refund_amount: refundResult.refundAmount,
        refund_percentage: refundResult.refundPercentage,
        time_before_start_hours: refundResult.timeBeforeStartHours
      }
    }

    return createResponse(responseData)

  } catch (error) {
    console.error('Error in cancel-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})