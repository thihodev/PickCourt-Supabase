import { createSupabaseAdminClient } from '../../supabase/functions/_shared/utils.ts'
import moment from 'npm:moment-timezone'

export interface CalculatePricingInput {
  courtId: string
  startTime: string
  endTime: string
  timezone?: string
}

export interface PriceBreakdown {
  time_slot: string
  price_per_hour: number
  hours: number
  cost: number
}

export interface PricingResult {
  totalAmount: number
  applicablePrice: number
  priceBreakdown: PriceBreakdown[]
  durationHours: number
}

export class PricingCalculatorService {
  private supabase = createSupabaseAdminClient()

  async calculatePricing(input: CalculatePricingInput): Promise<PricingResult> {
    const { courtId, startTime, endTime, timezone = 'Asia/Ho_Chi_Minh' } = input

    const startMoment = moment(startTime)
    const endMoment = moment(endTime)
    const durationHours = moment.duration(endMoment.diff(startMoment)).asHours()

    // Get the day of week (0 = Sunday, 1 = Monday, etc.) - moment uses same format as JS Date
    const dayOfWeek = startMoment.day()

    // Get all price slots that might overlap with booking time
    const { data: courtPrices, error: priceError } = await this.supabase
      .from('court_prices')
      .select('price, start_time, end_time')
      .eq('court_id', courtId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('start_time')

    if (priceError) {
      throw new Error(`Error fetching court prices: ${priceError.message}`)
    }

    if (!courtPrices || courtPrices.length === 0) {
      throw new Error('No pricing available for the selected day')
    }

    // Calculate total amount by checking each time segment
    let totalAmount = 0
    let applicablePrice = 0 // For metadata
    const priceBreakdown: PriceBreakdown[] = []

    // Convert booking times to minutes for easier calculation
    const bookingStartMinutes = startMoment.tz(timezone).hours() * 60 + startMoment.tz(timezone).minutes()
    const bookingEndMinutes = endMoment.tz(timezone).hours() * 60 + endMoment.tz(timezone).minutes()

    // Find overlapping price slots and calculate proportional cost
    for (const priceSlot of courtPrices) {
      const [slotStartHour, slotStartMin] = priceSlot.start_time.split(':').map(Number)
      const [slotEndHour, slotEndMin] = priceSlot.end_time.split(':').map(Number)
      
      const slotStartMinutes = slotStartHour * 60 + slotStartMin
      const slotEndMinutes = slotEndHour * 60 + slotEndMin

      // Calculate overlap between booking time and price slot
      const overlapStart = Math.max(bookingStartMinutes, slotStartMinutes)
      const overlapEnd = Math.min(bookingEndMinutes, slotEndMinutes)

      if (overlapStart < overlapEnd) {
        const overlapMinutes = overlapEnd - overlapStart
        const overlapHours = overlapMinutes / 60
        const segmentCost = priceSlot.price * overlapHours

        totalAmount += segmentCost
        applicablePrice = priceSlot.price // Use last applicable price for metadata

        priceBreakdown.push({
          time_slot: `${priceSlot.start_time}-${priceSlot.end_time}`,
          price_per_hour: priceSlot.price,
          hours: overlapHours,
          cost: segmentCost
        })
      }
    }

    // Check if entire booking time is covered by price slots
    if (totalAmount === 0) {
      throw new Error('No pricing available for the selected time slot')
    }

    return {
      totalAmount: Math.round(totalAmount),
      applicablePrice,
      priceBreakdown,
      durationHours
    }
  }
}