import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import { UpstashBookedSlotService } from './UpstashBookedSlotService.ts'
import type { Booking } from '../types/database.types.ts'

export interface UpdateBookingStatusInput {
  bookingId: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  userId: string
  metadata?: Record<string, any>
}

export interface UpdateBookedSlotsInput {
  bookingId: string
  status: 'scheduled' | 'confirmed' | 'cancelled'
  metadata?: Record<string, any>
}

export interface CreateBookingInput {
  clubId: string
  userId: string
  startTime: string
  endTime: string
  totalAmount: number
  metadata?: Record<string, any>
}

export interface CreateBookedSlotInput {
  bookingId: string
  courtId: string
  startTime: string
  endTime: string
  totalAmount: number
  expiryMinutes?: number
  metadata?: Record<string, any>
}

export class BookingOperationsService {
  private supabase = createSupabaseAdminClient()
  private upstashService = new UpstashBookedSlotService()

  async updateBookingStatus(input: UpdateBookingStatusInput): Promise<any> {
    const { bookingId, status, userId, metadata } = input

    const updateData = {
      status,
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        [`${status}_at`]: new Date().toISOString(),
        [`${status}_by`]: userId
      }
    }

    const { data: updatedBooking, error } = await this.supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update booking status: ${error.message}`)
    }

    return updatedBooking
  }

  async updateBookedSlotsStatus(input: UpdateBookedSlotsInput): Promise<any[]> {
    const { bookingId, status, metadata } = input

    const { data: updatedSlots, error } = await this.supabase
      .from('booked_slots')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
        metadata
      })
      .eq('booking_id', bookingId)
      .select()

    if (error) {
      throw new Error(`Failed to update booked slots: ${error.message}`)
    }

    return updatedSlots || []
  }

  async addSlotsToUpstash(clubId: string, slots: any[], bookingId: string): Promise<void> {
    try {
      for (const slot of slots) {
        const dateKey = new Date(slot.start_time).toISOString().split('T')[0]
        await this.upstashService.addBookedSlot(clubId, dateKey, {
          courtId: slot.court_id,
          startTime: slot.start_time,
          endTime: slot.end_time,
          bookingId: bookingId,
          slotId: slot.id
        })
      }
    } catch (error) {
      console.error('Error adding slots to Upstash:', error)
      // Don't fail the entire operation if Upstash fails
    }
  }

  async removeSlotsFromUpstash(clubId: string, slots: any[]): Promise<void> {
    try {
      for (const slot of slots) {
        const dateKey = new Date(slot.start_time).toISOString().split('T')[0]
        await this.upstashService.removeBookedSlot(
          clubId,
          dateKey,
          slot.court_id,
          slot.start_time,
          slot.end_time
        )
      }
    } catch (error) {
      console.error('Error removing slots from Upstash:', error)
      // Don't fail the entire operation if Upstash fails
    }
  }

  async createBooking(input: CreateBookingInput): Promise<any> {
    const { clubId, userId, startTime, endTime, totalAmount, metadata } = input

    const bookingData = {
      club_id: clubId,
      user_id: userId,
      start_time: startTime,
      end_time: endTime,
      booking_type: 'single',
      total_amount: totalAmount,
      status: 'pending',
      metadata: {
        ...metadata,
        created_by: userId
      }
    }

    const { data: booking, error } = await this.supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create booking: ${error.message}`)
    }

    return booking
  }

  async createBookedSlot(input: CreateBookedSlotInput): Promise<void> {
    const { bookingId, courtId, startTime, endTime, totalAmount, expiryMinutes = 10, metadata } = input

    const bookedSlotData = {
      booking_id: bookingId,
      court_id: courtId,
      start_time: startTime,
      end_time: endTime,
      status: 'scheduled',
      price: totalAmount,
      expiry_at: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
      metadata: {
        booking_type: 'single',
        ...metadata
      }
    }

    const { error } = await this.supabase
      .from('booked_slots')
      .insert(bookedSlotData)

    if (error) {
      console.error('Error creating booked slot:', error)
      // Don't fail the entire operation if slot creation fails
    }
  }

  async getBookingWithDetails(bookingId: string): Promise<any> {
    const { data: booking, error } = await this.supabase
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
      .eq('id', bookingId)
      .single()

    if (error || !booking) {
      throw new Error('Booking not found')
    }

    return booking
  }

  async updatePaymentStatus(bookingId: string, paymentMethod: string, isPayAtClub: boolean): Promise<void> {
    const updateData = {
      payment_status: isPayAtClub ? 'unpaid' : 'paid',
      payment_method: paymentMethod
    }

    await this.supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
  }
}