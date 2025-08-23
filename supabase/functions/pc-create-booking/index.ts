import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import { BookingValidationService } from '../../../src/services/BookingValidationService.ts'
import { CourtValidationService } from '../../../src/services/CourtValidationService.ts'
import { PricingCalculatorService } from '../../../src/services/PricingCalculatorService.ts'
import { BookingOperationsService } from '../../../src/services/BookingOperationsService.ts'
import { RecurringBookingService } from '../../../src/services/RecurringBookingService.ts'

interface CreateBookingRequest {
  court_id: string
  user_id?: string   // Optional for guest bookings
  start_time: string // ISO timestamp
  end_time: string   // ISO timestamp
  notes?: string
  customer_info?: {
    name?: string
    phone?: string
    email?: string
  }
  booking_type?: 'single' | 'recurring'
  recurring_config?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number // Mỗi bao nhiêu ngày/tuần/tháng
    end_date?: string // Ngày kết thúc
    occurrences?: number // Số lần lặp
    days_of_week?: number[] // [1,3,5] cho weekly (0=Sunday, 1=Monday, ...)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    const requestData: CreateBookingRequest = await req.json()

    // Initialize services
    const validationService = new BookingValidationService()
    const courtService = new CourtValidationService()
    const pricingService = new PricingCalculatorService()
    const bookingService = new BookingOperationsService()
    const recurringService = new RecurringBookingService()

    // Validate required fields
    if (!requestData.court_id || !requestData.start_time || !requestData.end_time) {
      return createErrorResponse('Missing required fields: court_id, start_time, end_time', 400)
    }

    // Validate recurring config if provided
    const bookingType = requestData.booking_type || 'single'
    if (bookingType === 'recurring') {
      if (!requestData.recurring_config) {
        return createErrorResponse('recurring_config is required for recurring bookings', 400)
      }
      if (!requestData.recurring_config.frequency) {
        return createErrorResponse('recurring_config.frequency is required', 400)
      }
      if (requestData.recurring_config.frequency === 'weekly' && !requestData.recurring_config.days_of_week) {
        return createErrorResponse('days_of_week is required for weekly recurring bookings', 400)
      }
    }

    // Validate time format and logic
    validationService.validateBookingForCreation({
      courtId: requestData.court_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time,
    })

    const supabase = createAuthenticatedClient(req)
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Validate court exists
    const court = await courtService.validateCourtExists({ courtId: requestData.court_id })

    // Validate operating hours
    courtService.validateOperatingHours({
      court,
      startTime: requestData.start_time,
      endTime: requestData.end_time
    })

    let slots = []
    let totalAmount = 0

    if (bookingType === 'single') {
      // Single booking logic
      await courtService.checkConflicts({
        courtId: requestData.court_id,
        startTime: requestData.start_time,
        endTime: requestData.end_time
      })

      const timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'
      const pricingResult = await pricingService.calculatePricing({
        courtId: requestData.court_id,
        startTime: requestData.start_time,
        endTime: requestData.end_time,
        timezone
      })

      slots = [{
        startTime: requestData.start_time,
        endTime: requestData.end_time,
        price: pricingResult.totalAmount
      }]
      totalAmount = pricingResult.totalAmount

    } else {
      // Recurring booking logic
      const recurringSlots = recurringService.generateRecurringSlots(
        requestData.start_time,
        requestData.end_time,
        requestData.recurring_config!
      )

      // Validate all slots don't conflict
      const validation = await recurringService.validateRecurringSlots(
        requestData.court_id,
        recurringSlots
      )

      if (!validation.isValid) {
        return createErrorResponse(
          `Conflicts found for ${validation.conflicts.length} slots. First conflict: ${validation.conflicts[0]?.start_time}`,
          409
        )
      }

      // Calculate pricing for all slots
      const timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'
      const pricingResult = await recurringService.calculateRecurringPricing(
        requestData.court_id,
        recurringSlots,
        timezone
      )

      slots = pricingResult.slotPrices.map(sp => ({
        startTime: sp.slot.start_time,
        endTime: sp.slot.end_time,
        price: sp.amount
      }))
      totalAmount = pricingResult.totalAmount
    }

    // Create booking
    const booking = await bookingService.createBooking({
      clubId: court.club_id,
      userId: requestData.user_id || null, // null for guest bookings
      startTime: requestData.start_time,
      endTime: requestData.end_time,
      totalAmount: totalAmount,
      bookingType: bookingType,
      recurringConfig: requestData.recurring_config,
      metadata: {
        notes: requestData.notes,
        court_id: requestData.court_id,
        court_name: court.name,
        club_name: court.club.name,
        slots_count: slots.length,
        is_guest_booking: !requestData.user_id
      }
    })

    // Create booked slots in DB
    await bookingService.createMultipleBookedSlots({
      bookingId: booking.id,
      courtId: requestData.court_id,
      slots: slots,
      metadata: {
        created_by: requestData.user_id || 'guest',
        booking_type: bookingType,
        is_guest_booking: !requestData.user_id
      }
    })

    // Add reserved slots to cache (10 minutes hold)
    await bookingService.addMultipleReservedSlotsToCache(
      court.club_id,
      requestData.court_id,
      slots,
      booking.id
    )

    // Return booking with court info
    const responseData = {
      ...booking,
      court: {
        id: court.id,
        name: court.name,
        club: court.club
      },
      slots_info: {
        count: slots.length,
        total_amount: totalAmount,
        booking_type: bookingType
      }
    }

    return createResponse(responseData, 201)

  } catch (error) {
    console.error('Error in create-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})