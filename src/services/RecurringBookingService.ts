import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'

export interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  end_date?: string
  occurrences?: number
  days_of_week?: number[] // For weekly: [1,3,5] = Mon,Wed,Fri
}

export interface SlotDate {
  start_time: string
  end_time: string
}

export class RecurringBookingService {
  private supabase = createSupabaseAdminClient()

  /**
   * Generate slot dates for recurring booking
   */
  generateRecurringSlots(
    originalStartTime: string,
    originalEndTime: string,
    config: RecurringConfig
  ): SlotDate[] {
    const slots: SlotDate[] = []
    const startDate = new Date(originalStartTime)
    const endDate = new Date(originalEndTime)
    
    // Calculate duration in milliseconds
    const duration = endDate.getTime() - startDate.getTime()
    
    let currentDate = new Date(startDate)
    let count = 0
    const maxDate = config.end_date ? new Date(config.end_date) : null
    const maxOccurrences = config.occurrences || 50 // Default limit

    while (count < maxOccurrences) {
      let shouldInclude = false

      if (config.frequency === 'daily') {
        shouldInclude = true
      } else if (config.frequency === 'weekly' && config.days_of_week) {
        const dayOfWeek = currentDate.getDay()
        shouldInclude = config.days_of_week.includes(dayOfWeek)
      } else if (config.frequency === 'monthly') {
        shouldInclude = true
      }

      if (shouldInclude) {
        // Check if we've exceeded end_date
        if (maxDate && currentDate > maxDate) {
          break
        }

        const slotStart = new Date(currentDate)
        const slotEnd = new Date(currentDate.getTime() + duration)
        
        slots.push({
          start_time: slotStart.toISOString(),
          end_time: slotEnd.toISOString()
        })
        
        count++
      }

      // Move to next date based on frequency
      if (config.frequency === 'daily') {
        currentDate.setDate(currentDate.getDate() + config.interval)
      } else if (config.frequency === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 1) // Move day by day for weekly
      } else if (config.frequency === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + config.interval)
      }
    }

    return slots
  }

  /**
   * Validate all recurring slots don't conflict
   */
  async validateRecurringSlots(
    courtId: string,
    slots: SlotDate[]
  ): Promise<{ isValid: boolean; conflicts: SlotDate[] }> {
    const conflicts: SlotDate[] = []

    for (const slot of slots) {
      // Check for existing bookings that overlap
      const { data: existingSlots, error } = await this.supabase
        .from('booked_slots')
        .select('start_time, end_time')
        .eq('court_id', courtId)
        .neq('status', 'cancelled')
        .or(
          `and(start_time.lte.${slot.start_time},end_time.gt.${slot.start_time}),` +
          `and(start_time.lt.${slot.end_time},end_time.gte.${slot.end_time}),` +
          `and(start_time.gte.${slot.start_time},end_time.lte.${slot.end_time})`
        )

      if (error) {
        throw new Error(`Failed to validate slot ${slot.start_time}: ${error.message}`)
      }

      if (existingSlots && existingSlots.length > 0) {
        conflicts.push(slot)
      }
    }

    return {
      isValid: conflicts.length === 0,
      conflicts
    }
  }

  /**
   * Calculate total pricing for all recurring slots
   */
  async calculateRecurringPricing(
    courtId: string,
    slots: SlotDate[],
    timezone: string = 'Asia/Ho_Chi_Minh'
  ): Promise<{
    totalAmount: number
    slotPrices: { slot: SlotDate; amount: number }[]
  }> {
    // Import PricingCalculatorService dynamically to avoid circular imports
    const { PricingCalculatorService } = await import('./PricingCalculatorService.ts')
    const pricingService = new PricingCalculatorService()
    
    const slotPrices: { slot: SlotDate; amount: number }[] = []
    let totalAmount = 0

    for (const slot of slots) {
      const pricingResult = await pricingService.calculatePricing({
        courtId,
        startTime: slot.start_time,
        endTime: slot.end_time,
        timezone
      })
      
      slotPrices.push({
        slot,
        amount: pricingResult.totalAmount
      })
      
      totalAmount += pricingResult.totalAmount
    }

    return {
      totalAmount,
      slotPrices
    }
  }
}