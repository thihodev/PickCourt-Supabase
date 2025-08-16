import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import { UpstashBookedSlotService } from './UpstashBookedSlotService.ts'
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
  private upstashService = new UpstashBookedSlotService()

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

    // Extract club_id and date from court for cache lookup
    const { data: court, error: courtError } = await this.supabase
      .from('courts')
      .select('club_id')
      .eq('id', courtId)
      .single()

    if (courtError || !court) {
      throw new Error('Court not found')
    }

    const date = moment(startTime).format('YYYY-MM-DD')
    
    // Check conflicts in Upstash cache (both confirmed and pending slots)
    const isAvailable = await this.upstashService.isSlotAvailable(
      court.club_id,
      date,
      courtId,
      startTime,
      endTime
    )

    if (!isAvailable) {
      throw new Error('Time slot is already booked or reserved')
    }
  }
}