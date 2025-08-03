import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { PaymentInsert, Payment } from '../types/database.types.ts'

export interface CreatePaymentInput {
  bookingId: string
  amount: number
  paymentMethod: string
  transactionId: string
  tenantId: string
  confirmedBy: string
}

export class PaymentService {
  private supabase = createSupabaseAdminClient()

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const {
      bookingId,
      amount,
      paymentMethod,
      transactionId,
      tenantId,
      confirmedBy
    } = input

    const paymentData: PaymentInsert = {
      tenant_id: tenantId,
      booking_id: bookingId,
      amount: amount,
      payment_method: paymentMethod,
      transaction_id: transactionId,
      status: 'completed',
      paid_at: new Date().toISOString(),
      metadata: {
        confirmed_with_booking: true,
        confirmed_by: confirmedBy,
        confirmed_at: new Date().toISOString()
      }
    }

    const { data: payment, error } = await this.supabase
      .from('payments')
      .insert(paymentData)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to create payment: ${error.message}`)
    }

    return payment
  }

  async getPaymentsByBooking(bookingId: string): Promise<Payment[]> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get payments: ${error.message}`)
    }

    return data || []
  }

  async updatePaymentStatus(
    paymentId: string, 
    status: 'pending' | 'completed' | 'failed' | 'refunded'
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    }

    if (status === 'completed') {
      updateData.paid_at = new Date().toISOString()
    }

    const { error } = await this.supabase
      .from('payments')
      .update(updateData)
      .eq('id', paymentId)

    if (error) {
      throw new Error(`Failed to update payment status: ${error.message}`)
    }
  }

  async refundPayment(paymentId: string, refundAmount?: number): Promise<void> {
    const { data: payment, error: getError } = await this.supabase
      .from('payments')
      .select('amount, status')
      .eq('id', paymentId)
      .single()

    if (getError || !payment) {
      throw new Error('Payment not found')
    }

    if (payment.status !== 'completed') {
      throw new Error('Can only refund completed payments')
    }

    const actualRefundAmount = refundAmount || payment.amount

    if (actualRefundAmount > payment.amount) {
      throw new Error('Refund amount cannot exceed original payment')
    }

    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
        metadata: {
          refund_amount: actualRefundAmount,
          refunded_at: new Date().toISOString()
        }
      })
      .eq('id', paymentId)

    if (error) {
      throw new Error(`Failed to refund payment: ${error.message}`)
    }
  }

  calculateBookingAmount(court: { hourly_rate: number }, startTime: string, endTime: string): number {
    const start = new Date(startTime)
    const end = new Date(endTime)
    const durationMs = end.getTime() - start.getTime()
    const durationHours = durationMs / (1000 * 60 * 60)
    
    return Math.round(court.hourly_rate * durationHours)
  }
}