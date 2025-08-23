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
  bookingType?: 'single' | 'recurring'
  recurringConfig?: Record<string, any>
  metadata?: Record<string, any>
}

export interface CreateBookedSlotInput {
  bookingId: string
  courtId: string
  startTime: string
  endTime: string
  price: number
  expiryMinutes?: number
  metadata?: Record<string, any>
}

export interface CreateMultipleSlotsInput {
  bookingId: string
  courtId: string
  slots: Array<{
    startTime: string
    endTime: string
    price: number
  }>
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
    const { 
      clubId, 
      userId, 
      startTime, 
      endTime, 
      totalAmount, 
      bookingType = 'single',
      recurringConfig,
      metadata 
    } = input

    const bookingData = {
      club_id: clubId,
      user_id: userId,
      start_time: startTime,
      end_time: endTime,
      booking_type: bookingType,
      total_amount: totalAmount,
      status: 'pending',
      recurring_config: recurringConfig || {},
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
    const { bookingId, courtId, startTime, endTime, price, expiryMinutes = 10, metadata } = input

    const bookedSlotData = {
      booking_id: bookingId,
      court_id: courtId,
      start_time: startTime,
      end_time: endTime,
      status: 'scheduled',
      price: price,
      expiry_at: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
      metadata: {
        ...metadata
      }
    }

    const { error } = await this.supabase
      .from('booked_slots')
      .insert(bookedSlotData)

    if (error) {
      throw new Error(`Failed to create booked slot: ${error.message}`)
    }
  }

  async createMultipleBookedSlots(input: CreateMultipleSlotsInput): Promise<void> {
    const { bookingId, courtId, slots, expiryMinutes = 10, metadata } = input

    const bookedSlotsData = slots.map(slot => ({
      booking_id: bookingId,
      court_id: courtId,
      start_time: slot.startTime,
      end_time: slot.endTime,
      status: 'scheduled',
      price: slot.price,
      expiry_at: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
      metadata: {
        ...metadata
      }
    }))

    const { error } = await this.supabase
      .from('booked_slots')
      .insert(bookedSlotsData)

    if (error) {
      throw new Error(`Failed to create booked slots: ${error.message}`)
    }
  }

  async addReservedSlotToCache(
    clubId: string,
    courtId: string,
    startTime: string,
    endTime: string,
    bookingId: string,
    slotId: string,
    expiryMinutes = 10
  ): Promise<void> {
    try {
      const date = new Date(startTime).toISOString().split('T')[0]
      await this.upstashService.addReservedSlot(clubId, date, {
        courtId,
        startTime,
        endTime,
        bookingId,
        slotId,
        status: 'reserved'
      }, expiryMinutes)
    } catch (error) {
      console.error('Error adding reserved slot to cache:', error)
      // Don't fail the entire operation if cache fails
    }
  }

  async addMultipleReservedSlotsToCache(
    clubId: string,
    courtId: string,
    slots: Array<{
      startTime: string
      endTime: string
      price: number
    }>,
    bookingId: string,
    expiryMinutes = 10
  ): Promise<void> {
    try {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]
        const slotId = `temp_${bookingId}_${i}`
        await this.addReservedSlotToCache(
          clubId,
          courtId,
          slot.startTime,
          slot.endTime,
          bookingId,
          slotId,
          expiryMinutes
        )
      }
    } catch (error) {
      console.error('Error adding multiple reserved slots to cache:', error)
      // Don't fail the entire operation if cache fails
    }
  }

  async removeReservedSlotFromCache(
    clubId: string,
    courtId: string,
    startTime: string,
    endTime: string
  ): Promise<void> {
    try {
      const date = new Date(startTime).toISOString().split('T')[0]
      await this.upstashService.removeReservedSlot(clubId, date, courtId, startTime, endTime)
    } catch (error) {
      console.error('Error removing reserved slot from cache:', error)
      // Don't fail the entire operation if cache fails
    }
  }

  async removeAllReservedSlotsForBooking(
    clubId: string,
    bookingId: string,
    startTime: string
  ): Promise<void> {
    try {
      const date = new Date(startTime).toISOString().split('T')[0]
      await this.upstashService.removeAllReservedSlotsForBooking(clubId, date, bookingId)
    } catch (error) {
      console.error('Error removing all reserved slots for booking:', error)
      // Don't fail the entire operation if cache fails
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

}