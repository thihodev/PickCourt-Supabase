import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { BookedSlotInsert, BookedSlot } from '../types/database.types.ts'

export interface CreateBookedSlotInput {
  bookingId: string
  courtId: string
  startTime: string
  endTime: string
  price: number
  matchId?: string | null
  confirmedBy: string
  metadata?: Record<string, any>
}

export class BookedSlotService {
  private supabase = createSupabaseAdminClient()

  async createBookedSlot(input: CreateBookedSlotInput): Promise<BookedSlot> {
    const {
      bookingId,
      courtId,
      startTime,
      endTime,
      price,
      matchId,
      confirmedBy,
      metadata = {}
    } = input

    const bookedSlotData: BookedSlotInsert = {
      booking_id: bookingId,
      court_id: courtId,
      start_time: startTime,
      end_time: endTime,
      status: 'confirmed',
      price: price,
      match_id: matchId,
      metadata: {
        confirmed_at: new Date().toISOString(),
        confirmed_by: confirmedBy,
        match_created: !!matchId,
        ...metadata
      }
    }

    const { data: bookedSlot, error } = await this.supabase
      .from('booked_slots')
      .insert(bookedSlotData)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to create booked slot: ${error.message}`)
    }

    return bookedSlot
  }

  async updateSlotStatus(slotId: string, status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'): Promise<void> {
    const { error } = await this.supabase
      .from('booked_slots')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', slotId)

    if (error) {
      throw new Error(`Failed to update slot status: ${error.message}`)
    }
  }

  async getSlotsByBooking(bookingId: string): Promise<BookedSlot[]> {
    const { data, error } = await this.supabase
      .from('booked_slots')
      .select('*')
      .eq('booking_id', bookingId)

    if (error) {
      throw new Error(`Failed to get booked slots: ${error.message}`)
    }

    return data || []
  }

  async getSlotsByCourt(courtId: string, startDate: string, endDate: string): Promise<BookedSlot[]> {
    const { data, error } = await this.supabase
      .from('booked_slots')
      .select(`
        *,
        match:matches(*),
        booking:bookings(
          id,
          user_id,
          status,
          metadata
        )
      `)
      .eq('court_id', courtId)
      .gte('start_time', startDate)
      .lte('end_time', endDate)
      .neq('status', 'cancelled')
      .order('start_time')

    if (error) {
      throw new Error(`Failed to get court slots: ${error.message}`)
    }

    return data || []
  }

  async linkSlotToMatch(slotId: string, matchId: string): Promise<void> {
    const { error } = await this.supabase
      .from('booked_slots')
      .update({ 
        match_id: matchId,
        updated_at: new Date().toISOString()
      })
      .eq('id', slotId)

    if (error) {
      throw new Error(`Failed to link slot to match: ${error.message}`)
    }
  }
}