import { createResponse, createErrorResponse, requireAuth, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

interface CancelBookingRequest {
  booking_id: string
  reason?: string
  refund_amount?: number
  notes?: string
}

Deno.serve(async (req) => {

  console.log(12312321);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    const auth = requireAuth(['super_admin', 'admin', 'customer'])
    const context = await auth(req)

    if (context instanceof Response) {
      return context
    }

    const { tenant, user } = context
    const requestData: CancelBookingRequest = await req.json()

    if (!requestData.booking_id) {
      return createErrorResponse('Missing required field: booking_id', 400)
    }

    const supabase = createSupabaseAdminClient()

    // Get booking with court and club info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        user_id,
        start_time,
        end_time,
        booking_type,
        total_amount,
        status,
        metadata,
        created_at,
        updated_at,
        court:courts(
          id,
          name,
          hourly_rate,
          club:clubs(
            id,
            name,
            tenant_id
          )
        )
      `)
      .eq('id', requestData.booking_id)
      .single()

    if (bookingError || !booking) {
      return createErrorResponse('Booking not found', 404)
    }

    // Check tenant access
    if (booking.court.club.tenant_id !== tenant.id) {
      return createErrorResponse('Booking not accessible', 403)
    }

    // Check user permissions
    const isOwner = booking.user_id === user.id
    const isAdmin = user.role === 'admin' || user.role === 'super_admin'
    
    if (!isOwner && !isAdmin) {
      return createErrorResponse('Insufficient permissions to cancel this booking', 403)
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

    // For customers, enforce cancellation policy
    if (user.role === 'customer' && timeDiffHours < 2) {
      return createErrorResponse('Cannot cancel booking less than 2 hours before start time', 400)
    }

    // Determine refund amount
    let refundAmount = 0
    if (requestData.refund_amount !== undefined) {
      // Admin specified refund amount
      if (!isAdmin) {
        return createErrorResponse('Only admins can specify refund amount', 403)
      }
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
        cancelled_by: user.id,
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
      .select(`
        id,
        court_id,
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
      .single()

    if (updateError) {
      return createErrorResponse(updateError.message, 400)
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
          cancelled_by: user.id,
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
      court: {
        id: booking.court.id,
        name: booking.court.name,
        hourly_rate: booking.court.hourly_rate,
        club: booking.court.club
      },
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