import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import { UpstashBookedSlotService } from './UpstashBookedSlotService.ts'
import moment from 'npm:moment-timezone'

export interface GetAvailableSlotsInput {
  dateFrom?: string
  dateTo?: string
  duration?: number
  limit?: number
  offset?: number
  clubIds?: string[]
}

export interface TimeSlot {
  startTime: string
  endTime: string
  price: number
}

export interface AvailableSlot {
  clubId: string
  clubName: string
  courtId: string
  courtName: string
  date: string
  timeSlots: TimeSlot[]
}

export interface AvailableSlotsResult {
  slots: AvailableSlot[]
  total: number
  hasMore: boolean
}

export class AvailableSlotsService {
  private supabase = createSupabaseAdminClient()
  private upstashService = new UpstashBookedSlotService()

  async getAvailableSlots(input: GetAvailableSlotsInput): Promise<AvailableSlotsResult> {
    const {
      dateFrom = moment().format('YYYY-MM-DD'),
      dateTo = moment().add(10, 'days').format('YYYY-MM-DD'),
      duration = 60,
      limit = 50,
      offset = 0,
      clubIds
    } = input

    try {
      // 1. Get clubs first
      const clubs = await this.getClubsOptimized(clubIds, limit, offset)
      if (clubs.length === 0) {
        return { slots: [], total: 0, hasMore: false }
      }

      // Extract actual club IDs for further queries
      const actualClubIds = clubs.map(club => club.id)

      // 2. Batch fetch data in parallel
      const [allCourtPrices, allBookedSlots] = await Promise.all([
        this.getAllCourtPricesFixed(actualClubIds, dateFrom, dateTo),
        this.getAllBookedSlotsFixed(actualClubIds, dateFrom, dateTo)
      ])

      // 3. Generate slots with pre-fetched data  
      const availableSlots = this.generateAllSlots(
        clubs,
        dateFrom,
        dateTo,
        duration,
        allCourtPrices,
        allBookedSlots
      )

      // 4. Sort and return
      availableSlots.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        if (a.timeSlots.length > 0 && b.timeSlots.length > 0) {
          return a.timeSlots[0].startTime.localeCompare(b.timeSlots[0].startTime)
        }
        return 0
      })

      return {
        slots: availableSlots,
        total: availableSlots.length,
        hasMore: clubs.length === limit
      }
    } catch (error) {
      console.error('Error in getAvailableSlots:', error)
      return { slots: [], total: 0, hasMore: false }
    }
  }

  private async getClubsOptimized(clubIds?: string[], limit = 5, offset = 0): Promise<any[]> {
    try {
      let query = this.supabase
        .from('clubs')
        .select(`
          id,
          name,
          timezone,
          opening_time,
          closing_time,
          courts!inner(
            id,
            name,
            status
          )
        `)
        .eq('status', 'active')
        .eq('courts.status', 'active')

      if (clubIds && clubIds.length > 0) {
        query = query.in('id', clubIds)
      } else {
        query = query.limit(5)
      }

      query = query.range(offset, offset + limit - 1)

      const { data: clubs, error } = await query

      if (error) {
        console.error('Error fetching clubs:', error)
        return []
      }

      return clubs || []
    } catch (error) {
      console.error('Exception in getClubsOptimized:', error)
      return []
    }
  }

  private async getAllCourtPricesFixed(clubIds: string[], dateFrom: string, dateTo: string): Promise<any[]> {
    try {
      // Get all unique days of week in the date range
      const daysOfWeek = this.getAllDaysOfWeekInRange(dateFrom, dateTo)

      const { data: prices, error } = await this.supabase
        .from('court_prices')
        .select(`
          court_id,
          day_of_week,
          price,
          start_time,
          end_time,
          courts!inner(
            club_id
          )
        `)
        .eq('is_active', true)
        .in('day_of_week', daysOfWeek)
        .in('courts.club_id', clubIds)

      if (error) {
        console.error('Error fetching court prices:', error)
        return []
      }

      return prices || []
    } catch (error) {
      console.error('Exception in getAllCourtPricesFixed:', error)
      return []
    }
  }

  private async getAllBookedSlotsFixed(clubIds: string[], dateFrom: string, dateTo: string): Promise<any[]> {
    try {
      const allBookedSlots: any[] = []
      const dates = this.getDateRange(dateFrom, dateTo)

      // Batch fetch all slots (confirmed + pending) in parallel
      const promises: Promise<any[]>[] = []
      
      for (const clubId of clubIds) {
        for (const date of dates) {
          const promise = this.upstashService.getAllSlots(clubId, date)
            .then(({ all: slots }) => slots.map(slot => ({ ...slot, clubId, date })))
            .catch(error => {
              console.error(`Error fetching slots for ${clubId} on ${date}:`, error)
              return []
            })
          promises.push(promise)
        }
      }

      const results = await Promise.all(promises)
      for (const slots of results) {
        allBookedSlots.push(...slots)
      }

      return allBookedSlots
    } catch (error) {
      console.error('Exception in getAllBookedSlotsFixed:', error)
      return []
    }
  }

  private getAllDaysOfWeekInRange(dateFrom: string, dateTo: string): number[] {
    const daysSet: { [key: number]: boolean } = {}
    const current = moment(dateFrom)
    const end = moment(dateTo)

    while (current.isSameOrBefore(end, 'day')) {
      daysSet[current.day()] = true
      current.add(1, 'day')
    }

    return Object.keys(daysSet).map(day => parseInt(day))
  }

  private getDateRange(dateFrom: string, dateTo: string): string[] {
    const dates: string[] = []
    const current = moment(dateFrom)
    const end = moment(dateTo)

    while (current.isSameOrBefore(end, 'day')) {
      dates.push(current.format('YYYY-MM-DD'))
      current.add(1, 'day')
    }

    return dates
  }

  private generateAllSlots(
    clubs: any[],
    dateFrom: string,
    dateTo: string,
    duration: number,
    allCourtPrices: any[],
    allBookedSlots: any[]
  ): AvailableSlot[] {
    const availableSlots: AvailableSlot[] = []
    
    // Group data for fast lookup
    const pricesMap = this.groupCourtPrices(allCourtPrices)
    const slotsMap = this.groupBookedSlots(allBookedSlots)

    const currentDate = moment(dateFrom)
    const endDate = moment(dateTo)

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const dateKey = currentDate.format('YYYY-MM-DD')

      // Skip past dates
      if (currentDate.isBefore(moment(), 'day')) {
        currentDate.add(1, 'day')
        continue
      }

      for (const club of clubs) {
        const timezone = club.timezone || 'Asia/Ho_Chi_Minh'
        const openingTime = club.opening_time || '06:00'
        const closingTime = club.closing_time || '23:00'

        for (const court of club.courts || []) {
          const dayOfWeek = currentDate.day()
          const pricesKey = `${court.id}_${dayOfWeek}`
          const slotsKey = `${club.id}_${dateKey}`

          const courtPrices = pricesMap[pricesKey] || []
          const bookedSlots = slotsMap[slotsKey] || []

          const timeSlots = this.generateTimeSlots(
            dateKey,
            openingTime,
            closingTime,
            duration,
            timezone,
            bookedSlots,
            courtPrices,
            court.id
          )

          if (timeSlots.length > 0) {
            availableSlots.push({
              clubId: club.id,
              clubName: club.name,
              courtId: court.id,
              courtName: court.name,
              date: dateKey,
              timeSlots
            })
          }
        }
      }

      currentDate.add(1, 'day')
    }

    return availableSlots
  }

  private groupCourtPrices(prices: any[]): { [key: string]: any[] } {
    const map: { [key: string]: any[] } = {}

    for (const price of prices) {
      const key = `${price.court_id}_${price.day_of_week}`
      if (!map[key]) {
        map[key] = []
      }
      map[key].push(price)
    }

    // Sort prices by start_time
    for (const key in map) {
      map[key].sort((a, b) => a.start_time.localeCompare(b.start_time))
    }

    return map
  }

  private groupBookedSlots(bookedSlots: any[]): { [key: string]: any[] } {
    const map: { [key: string]: any[] } = {}

    for (const slot of bookedSlots) {
      const key = `${slot.clubId}_${slot.date}`
      if (!map[key]) {
        map[key] = []
      }
      map[key].push(slot)
    }

    return map
  }

  private generateTimeSlots(
    date: string,
    openingTime: string,
    closingTime: string,
    duration: number,
    timezone: string,
    bookedSlots: any[],
    courtPrices: any[],
    courtId: string
  ): TimeSlot[] {
    const timeSlots: TimeSlot[] = []
    
    // Early return if no prices
    if (courtPrices.length === 0) return timeSlots

    const currentTime = moment().tz(timezone)
    let slotStart = moment.tz(`${date} ${openingTime}`, 'YYYY-MM-DD HH:mm', timezone)
      .seconds(0)
      .milliseconds(0)
    const dayEnd = moment.tz(`${date} ${closingTime}`, 'YYYY-MM-DD HH:mm', timezone)

    // If it's today, start from current time rounded up
    if (moment(date).isSame(currentTime, 'day')) {
      const minutesToNextSlot = duration - (currentTime.minutes() % duration)
      const nextSlotTime = currentTime.clone()
        .add(minutesToNextSlot, 'minutes')
        .seconds(0)
        .milliseconds(0)
      
      if (nextSlotTime.isAfter(slotStart)) {
        slotStart = nextSlotTime
      }
    }

    while (slotStart.clone().add(duration, 'minutes').isSameOrBefore(dayEnd)) {
      const slotEnd = slotStart.clone().add(duration, 'minutes')
      
      // Check conflicts
      const isBooked = this.isSlotBooked(slotStart.toISOString(), slotEnd.toISOString(), bookedSlots, courtId)

      if (!isBooked) {
        const price = this.calculateSlotPrice(
          slotStart.format('HH:mm'),
          slotEnd.format('HH:mm'),
          courtPrices
        )

        if (price > 0) {
          timeSlots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            price
          })
        }
      }

      slotStart.add(duration, 'minutes').seconds(0).milliseconds(0)
    }

    return timeSlots
  }

  private isSlotBooked(startTime: string, endTime: string, bookedSlots: any[], courtId: string): boolean {
    return bookedSlots.some(slot => {
      if (slot.courtId !== courtId) return false
      return (
        moment(startTime).isBefore(moment(slot.endTime)) &&
        moment(endTime).isAfter(moment(slot.startTime))
      )
    })
  }

  private calculateSlotPrice(startTime: string, endTime: string, courtPrices: any[]): number {
    if (courtPrices.length === 0) return 0

    const startMinutes = this.timeToMinutes(startTime)
    const endMinutes = this.timeToMinutes(endTime)
    let totalPrice = 0

    for (const priceSlot of courtPrices) {
      const priceStartMinutes = this.timeToMinutes(priceSlot.start_time)
      const priceEndMinutes = this.timeToMinutes(priceSlot.end_time)

      const overlapStart = Math.max(startMinutes, priceStartMinutes)
      const overlapEnd = Math.min(endMinutes, priceEndMinutes)

      if (overlapStart < overlapEnd) {
        const overlapMinutes = overlapEnd - overlapStart
        const overlapHours = overlapMinutes / 60
        totalPrice += priceSlot.price * overlapHours
      }
    }

    return Math.round(totalPrice)
  }

  private timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number)
    return hours * 60 + minutes
  }
}