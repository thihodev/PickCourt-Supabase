import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import { UpstashBookedSlotService } from './UpstashBookedSlotService.ts'

export interface ExpiredBookingResult {
  expired_slots_count: number
  expired_bookings_count: number
  processed_booking_ids: string[]
  errors: string[]
  processed_at: string
}

export interface ExpiredSlot {
  id: string
  booking_id: string
  court_id: string
  start_time: string
  end_time: string
  status: string
  expiry_at: string
  booking: {
    id: string
    status: string
    user_id: string
    club_id: string
  }
}

export class ExpiredBookingService {
  private supabase = createSupabaseAdminClient()
  private upstashService = new UpstashBookedSlotService()

  async processExpiredBookings(): Promise<ExpiredBookingResult> {
    const now = new Date().toISOString()
    const result: ExpiredBookingResult = {
      expired_slots_count: 0,
      expired_bookings_count: 0,
      processed_booking_ids: [],
      errors: [],
      processed_at: now
    }

    try {
      // Step 1: Find expired slots
      const expiredSlots = await this.findExpiredSlots(now)
      
      if (expiredSlots.length === 0) {
        return result
      }

      // Step 2: Update slots to expired
      await this.updateSlotsToExpired(expiredSlots, result)

      // Step 3: Update bookings to expired
      await this.updateBookingsToExpired(expiredSlots, result)

      // Step 4: Clean up cache
      await this.cleanupCache(expiredSlots, result)

      return result

    } catch (error) {
      result.errors.push(`Unexpected error: ${error.message}`)
      throw error
    }
  }

  private async findExpiredSlots(now: string): Promise<ExpiredSlot[]> {
    const { data: expiredSlots, error } = await this.supabase
      .from('booked_slots')
      .select(`
        id,
        booking_id,
        court_id,
        start_time,
        end_time,
        status,
        expiry_at,
        booking:bookings!inner(
          id,
          status,
          user_id,
          club_id
        )
      `)
      .eq('status', 'scheduled')
      .not('expiry_at', 'is', null)
      .lt('expiry_at', now)

    if (error) {
      throw new Error(`Failed to find expired slots: ${error.message}`)
    }

    return (expiredSlots as ExpiredSlot[]) || []
  }

  private async updateSlotsToExpired(
    expiredSlots: ExpiredSlot[], 
    result: ExpiredBookingResult
  ): Promise<void> {
    const slotIds = expiredSlots.map(slot => slot.id)
    
    const { error } = await this.supabase
      .from('booked_slots')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .in('id', slotIds)

    if (error) {
      result.errors.push(`Failed to update slots: ${error.message}`)
      throw new Error(`Failed to update slots: ${error.message}`)
    }

    result.expired_slots_count = expiredSlots.length
  }

  private async updateBookingsToExpired(
    expiredSlots: ExpiredSlot[], 
    result: ExpiredBookingResult
  ): Promise<void> {
    const uniqueBookingIds = [...new Set(expiredSlots.map(slot => slot.booking_id))]
    const now = new Date().toISOString()
    
    // Only update bookings that are still in 'pending' status
    const { data: updatedBookings, error } = await this.supabase
      .from('bookings')
      .update({
        status: 'expired',
        updated_at: now,
        metadata: this.supabase.sql`
          COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'expired_at', ${now},
            'expired_reason', 'payment_timeout',
            'original_expiry_slots', ${JSON.stringify(expiredSlots.length)}
          )
        `
      })
      .in('id', uniqueBookingIds)
      .eq('status', 'pending')
      .select('id')

    if (error) {
      result.errors.push(`Failed to update bookings: ${error.message}`)
      throw new Error(`Failed to update bookings: ${error.message}`)
    }

    result.expired_bookings_count = updatedBookings?.length || 0
    result.processed_booking_ids = updatedBookings?.map(b => b.id) || []
  }

  private async cleanupCache(
    expiredSlots: ExpiredSlot[], 
    result: ExpiredBookingResult
  ): Promise<void> {
    try {
      for (const slot of expiredSlots) {
        const dateKey = new Date(slot.start_time).toISOString().split('T')[0]
        
        // Remove from cache if it exists
        await this.upstashService.removeReservedSlot(
          slot.booking.club_id,
          dateKey,
          slot.court_id,
          slot.start_time,
          slot.end_time
        )
      }
    } catch (error) {
      result.errors.push(`Cache cleanup failed: ${error.message}`)
      // Don't throw here, cache cleanup is not critical
    }
  }

}