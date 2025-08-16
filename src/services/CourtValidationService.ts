import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import moment from 'npm:moment-timezone'

export interface ValidateCourtInput {
  courtId: string
}

export interface ValidateOperatingHoursInput {
  court: any
  startTime: string
  endTime: string
}

export interface CheckConflictsInput {
  courtId: string
  startTime: string
  endTime: string
}

export class CourtValidationService {
  private supabase = createSupabaseAdminClient()

  async validateCourtExists(input: ValidateCourtInput): Promise<any> {
    const { courtId } = input

    const { data: court, error } = await this.supabase
      .from('courts')
      .select(`
        *,
        club:clubs(*)
      `)
      .eq('id', courtId)
      .eq('status', 'active')
      .single()

    if (error || !court) {
      throw new Error('Court not found or inactive')
    }

    return court
  }

  validateOperatingHours(input: ValidateOperatingHoursInput): void {
    const { court, startTime, endTime } = input

    if (!court.club.opening_time || !court.club.closing_time) {
      return // No operating hours set
    }

    let timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'

    // Convert booking times to club timezone using moment
    const startTimeInClubTZ = moment(startTime).tz(timezone)
    const endTimeInClubTZ = moment(endTime).tz(timezone)

    // Extract time parts (HH:MM format)
    const startTimeStr = startTimeInClubTZ.format('HH:mm')
    const endTimeStr = endTimeInClubTZ.format('HH:mm')

    const openingTime = court.club.opening_time
    const closingTime = court.club.closing_time

    // Check if booking is within operating hours
    if (startTimeStr < openingTime || endTimeStr > closingTime) {
      throw new Error(
        `Booking time must be within operating hours: ${openingTime} - ${closingTime}`
      )
    }
  }

  async checkConflicts(input: CheckConflictsInput): Promise<void> {
    const { courtId, startTime, endTime } = input

    // Check for conflicting bookings via booked_slots
    // Only consider confirmed slots or pending slots that haven't expired
    const nowISO = moment().toISOString()
    
    const { data: conflicts, error } = await this.supabase
      .from('booked_slots')
      .select('id, start_time, end_time, status, expiry_at')
      .eq('court_id', courtId)
      .neq('status', 'cancelled')
      .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`)

    if (error) {
      throw new Error(`Failed to check conflicts: ${error.message}`)
    }

    // Filter out expired scheduled slots
    const activeConflicts = conflicts?.filter((slot: any) => {
      if (slot.status === 'confirmed') {
        return true // Confirmed slots are always active
      }
      if (slot.status === 'scheduled') {
        return slot.expiry_at && slot.expiry_at > nowISO // Only active if not expired
      }
      return false
    }) || []

    if (activeConflicts.length > 0) {
      throw new Error('Time slot is already booked')
    }
  }
}