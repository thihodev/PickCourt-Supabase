import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'

export interface CancellationPolicyInput {
  startTime: string
  totalAmount: number
  customRefundAmount?: number
}

export interface CancellationResult {
  refundAmount: number
  refundPercentage: number
  timeBeforeStartHours: number
}

export interface CancelMatchesInput {
  bookingId: string
  userId: string
  reason?: string
  notes?: string
}

export interface CreateRefundInput {
  bookingId: string
  refundAmount: number
  originalAmount: number
  reason?: string
}

export class BookingCancellationService {
  private supabase = createSupabaseAdminClient()

  calculateRefund(input: CancellationPolicyInput): CancellationResult {
    const { startTime, totalAmount, customRefundAmount } = input

    const startTimeDate = new Date(startTime)
    const now = new Date()
    const timeDiffHours = (startTimeDate.getTime() - now.getTime()) / (1000 * 60 * 60)

    let refundAmount: number

    if (customRefundAmount !== undefined) {
      refundAmount = Math.max(0, Math.min(customRefundAmount, totalAmount))
    } else {
      // Auto-calculate refund based on policy
      if (timeDiffHours >= 24) {
        refundAmount = totalAmount // Full refund
      } else if (timeDiffHours >= 2) {
        refundAmount = Math.round(totalAmount * 0.5) // 50% refund
      } else {
        refundAmount = 0 // No refund
      }
    }

    return {
      refundAmount,
      refundPercentage: Math.round((refundAmount / totalAmount) * 100),
      timeBeforeStartHours: Math.round(timeDiffHours * 100) / 100
    }
  }

  async cancelMatches(input: CancelMatchesInput): Promise<void> {
    const { bookingId, userId, reason, notes } = input

    const now = new Date().toISOString()

    const { error } = await this.supabase
      .from('matches')
      .update({
        status: 'cancelled',
        updated_at: now,
        metadata: {
          cancelled_at: now,
          cancelled_by: userId,
          cancellation_reason: reason,
          cancellation_notes: notes
        }
      })
      .eq('booking_id', bookingId)

    if (error) {
      console.error('Error cancelling matches:', error)
      // Don't throw error to avoid failing the entire cancellation process
    }
  }

  async createRefundRecord(input: CreateRefundInput): Promise<void> {
    const { bookingId, refundAmount, originalAmount, reason } = input

    if (refundAmount <= 0) {
      return // No refund to create
    }

    const refundData = {
      booking_id: bookingId,
      amount: -refundAmount, // Negative amount for refund
      payment_method: 'refund',
      status: 'pending', // Admin needs to process refund
      metadata: {
        refund_for_cancellation: true,
        cancelled_at: new Date().toISOString(),
        original_amount: originalAmount,
        refund_reason: reason
      }
    }

    const { error } = await this.supabase
      .from('payments')
      .insert(refundData)

    if (error) {
      console.error('Error creating refund record:', error)
      // Don't throw error to avoid failing the entire cancellation process
    }
  }

  async validateCancellation(booking: any): Promise<void> {
    // Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled')
    }

    if (booking.status === 'completed') {
      throw new Error('Cannot cancel a completed booking')
    }
  }
}