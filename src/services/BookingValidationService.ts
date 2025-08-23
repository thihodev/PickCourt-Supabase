import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import type { Booking } from '../types/database.types.ts'

export interface BookingValidationInput {
  booking: Booking
  userId: string
  userRole: string
  tenantId: string
}

export interface ConflictCheckInput {
  courtId: string
  startTime: string
  endTime: string
  excludeBookingId: string
}

export class BookingValidationService {
  private supabase = createSupabaseAdminClient()

  validateBookingForConfirmation(input: BookingValidationInput): void {
    const { booking, userId, userRole, tenantId } = input

    // Check user permissions
    const isOwner = booking.user_id === userId
    const isAdmin = userRole === 'tenant_admin' || userRole === 'super_admin'
    
    if (!isOwner && !isAdmin) {
      throw new Error('Insufficient permissions to confirm this booking')
    }

    // Check if booking can be confirmed
    if (booking.status === 'confirmed') {
      throw new Error('Booking is already confirmed')
    }

    if (booking.status === 'cancelled') {
      throw new Error('Cannot confirm a cancelled booking')
    }

    if (booking.status === 'completed') {
      throw new Error('Cannot confirm a completed booking')
    }

    // Check if booking time has passed
    const startTime = new Date(booking.start_time)
    const now = new Date()
    
    if (startTime <= now) {
      throw new Error('Cannot confirm a booking that has already started')
    }
  }

  async checkBookingConflicts(input: ConflictCheckInput): Promise<void> {
    const { courtId, startTime, endTime, excludeBookingId } = input

    const { data: conflicts, error } = await this.supabase
      .from('bookings')
      .select('id')
      .eq('court_id', courtId)
      .eq('status', 'confirmed')
      .neq('id', excludeBookingId)
      .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`)

    if (error) {
      throw new Error(`Failed to check conflicts: ${error.message}`)
    }

    if (conflicts && conflicts.length > 0) {
      throw new Error('Time slot has been confirmed by another booking')
    }
  }

  validateBookingForCreation(input: {
    courtId: string
    startTime: string
    endTime: string
  }): void {
    const { startTime, endTime } = input

    // Validate time format and logic
    const start = new Date(startTime)
    const end = new Date(endTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format for start_time or end_time')
    }

    if (start >= end) {
      throw new Error('start_time must be before end_time')
    }

    // Check if start time is in the future
    const now = new Date()
    if (start <= now) {
      throw new Error('start_time must be in the future')
    }
  }

  async validateCourtAccess(courtId: string, tenantId: string): Promise<any> {
    const { data: court, error } = await this.supabase
      .from('courts')
      .select(`
        id,
        name,
        hourly_rate,
        status,
        club:clubs(
          id,
          name,
          tenant_id,
          opening_time,
          closing_time,
          timezone
        )
      `)
      .eq('id', courtId)
      .eq('status', 'active')
      .single()

    if (error || !court) {
      throw new Error('Court not found or inactive')
    }

    if (court.club.tenant_id !== tenantId) {
      throw new Error('Court not accessible')
    }

    return court
  }

  validateOperatingHours(booking: {
    startTime: string
    endTime: string
  }, court: {
    club: {
      opening_time?: string
      closing_time?: string
      timezone?: string
    }
  }): void {
    if (!court.club.opening_time || !court.club.closing_time) {
      return // No operating hours set
    }

    const timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'
    
    // Convert booking times to club timezone
    const startTime = new Date(booking.startTime)
    const endTime = new Date(booking.endTime)
    
    const startTimeInClubTZ = new Date(startTime.toLocaleString("en-US", {timeZone: timezone}))
    const endTimeInClubTZ = new Date(endTime.toLocaleString("en-US", {timeZone: timezone}))
    
    // Extract time parts (HH:MM format)
    const startTimeStr = startTimeInClubTZ.toTimeString().substring(0, 5)
    const endTimeStr = endTimeInClubTZ.toTimeString().substring(0, 5)
    
    const openingTime = court.club.opening_time
    const closingTime = court.club.closing_time
    
    // Check if booking is within operating hours
    if (startTimeStr < openingTime || endTimeStr > closingTime) {
      throw new Error(`Booking time must be within operating hours: ${openingTime} - ${closingTime}`)
    }
  }
}