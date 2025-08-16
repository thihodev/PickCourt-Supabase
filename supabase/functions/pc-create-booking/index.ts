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

interface CreateBookingRequest {
  court_id: string
  user_id: string   // Required in payload
  start_time: string // ISO timestamp
  end_time: string   // ISO timestamp
  notes?: string
  customer_info?: {
    name?: string
    phone?: string
    email?: string
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

    // Validate required fields
    if (!requestData.court_id || !requestData.user_id || !requestData.start_time || !requestData.end_time) {
      return createErrorResponse('Missing required fields: court_id, user_id, start_time, end_time', 400)
    }

    // Validate time format and logic
    validationService.validateBookingForCreation({
      courtId: requestData.court_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time,
      userId: requestData.user_id
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

    // Check for conflicts
    await courtService.checkConflicts({
      courtId: requestData.court_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time
    })

    // Calculate pricing
    const timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'
    const pricingResult = await pricingService.calculatePricing({
      courtId: requestData.court_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time,
      timezone
    })

    // Create booking
    const booking = await bookingService.createBooking({
      clubId: court.club_id,
      userId: requestData.user_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time,
      totalAmount: pricingResult.totalAmount,
      metadata: {
        notes: requestData.notes,
        customer_info: requestData.customer_info,
        court_id: requestData.court_id,
        court_name: court.name,
        club_name: court.club.name,
        hourly_rate: pricingResult.applicablePrice,
        duration_hours: pricingResult.durationHours,
        price_breakdown: pricingResult.priceBreakdown
      }
    })

    // Create booked slot
    await bookingService.createBookedSlot({
      bookingId: booking.id,
      courtId: requestData.court_id,
      startTime: requestData.start_time,
      endTime: requestData.end_time,
      totalAmount: pricingResult.totalAmount,
      metadata: {
        created_by: requestData.user_id
      }
    })

    // Return booking with court info
    const responseData = {
      ...booking,
      court: {
        id: court.id,
        name: court.name,
        hourly_rate: pricingResult.applicablePrice,
        club: court.club
      }
    }

    return createResponse(responseData, 201)

  } catch (error) {
    console.error('Error in create-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})