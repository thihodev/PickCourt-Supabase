import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createSupabaseAdminClient,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import moment from 'npm:moment-timezone'

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

    // Validate required fields
    if (!requestData.court_id || !requestData.user_id || !requestData.start_time || !requestData.end_time) {
      return createErrorResponse('Missing required fields: court_id, user_id, start_time, end_time', 400)
    }

    // Validate time format and logic using moment
    const startTime = moment(requestData.start_time)
    const endTime = moment(requestData.end_time)

    if (!startTime.isValid() || !endTime.isValid()) {
      return createErrorResponse('Invalid date format for start_time or end_time', 400)
    }

    if (startTime.isSameOrAfter(endTime)) {
      return createErrorResponse('start_time must be before end_time', 400)
    }

    // Check if start time is in the future
    const now = moment()
    if (startTime.isSameOrBefore(now)) {
      return createErrorResponse('start_time must be in the future', 400)
    }

    const supabase = createAuthenticatedClient(req)
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Verify court exists
    const { data: court, error: courtError } = await supabase
      .from('courts')
      .select(`
        *,
        club:clubs(*)
      `)
      .eq('id', requestData.court_id)
      .eq('status', 'active')
      .single()

    if (courtError || !court) {
      console.error(courtError);
      return createErrorResponse('Court not found or inactive', 404)
    }

    let timezone = 'Asia/Ho_Chi_Minh';

    // Check if booking time is within club operating hours
    if (court.club.opening_time && court.club.closing_time) {
      timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'

      // Convert booking times to club timezone using moment
      const startTimeInClubTZ = startTime.clone().tz(timezone)
      const endTimeInClubTZ = endTime.clone().tz(timezone)

      // Extract time parts (HH:MM format)
      const startTimeStr = startTimeInClubTZ.format('HH:mm')
      const endTimeStr = endTimeInClubTZ.format('HH:mm')

      const openingTime = court.club.opening_time
      const closingTime = court.club.closing_time

      // Check if booking is within operating hours
      if (startTimeStr < openingTime || endTimeStr > closingTime) {
        return createErrorResponse(
          `Booking time must be within operating hours: ${openingTime} - ${closingTime}`,
          400
        )
      }
    }

    // Check for conflicting bookings via booked_slots
    const { data: conflicts, error: conflictError } = await supabase
      .from('booked_slots')
      .select('id, start_time, end_time')
      .eq('court_id', requestData.court_id)
      .neq('status', 'cancelled')
      .or(`and(start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()})`)

    if (conflictError) {
      return createErrorResponse(conflictError.message, 400)
    }

    if (conflicts && conflicts.length > 0) {
      return createErrorResponse('Time slot is already booked', 409)
    }

    // Calculate total amount using court_prices with detailed time slot handling
    const durationHours = moment.duration(endTime.diff(startTime)).asHours()

    // Get the day of week (0 = Sunday, 1 = Monday, etc.) - moment uses same format as JS Date
    const dayOfWeek = startTime.day()


    // Get all price slots that might overlap with booking time
    const { data: courtPrices, error: priceError } = await supabase
      .from('court_prices')
      .select('price, start_time, end_time')
      .eq('court_id', requestData.court_id)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('start_time')

    if (priceError) {
      return createErrorResponse(`Error fetching court prices: ${priceError.message}`, 400)
    }

    if (!courtPrices || courtPrices.length === 0) {
      return createErrorResponse('No pricing available for the selected day', 400)
    }

    // Calculate total amount by checking each time segment
    let totalAmount = 0
    let applicablePrice = 0 // For metadata
    const priceBreakdown = []

    // Convert booking times to minutes for easier calculation
    const bookingStartMinutes = startTime.tz(timezone).hours() * 60 + startTime.tz(timezone).minutes()
    const bookingEndMinutes = endTime.tz(timezone).hours() * 60 + endTime.tz(timezone).minutes()

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
      return createErrorResponse('No pricing available for the selected time slot', 400)
    }

    totalAmount = Math.round(totalAmount)

    // Create booking with only club_id (no tenant_id)
    const bookingData = {
      club_id: court.club_id,  // Store club_id in bookings table
      user_id: requestData.user_id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      booking_type: 'single',
      total_amount: totalAmount,
      status: 'pending', // Will be confirmed later
      metadata: {
        notes: requestData.notes,
        customer_info: requestData.customer_info,
        created_by: requestData.user_id,
        court_id: requestData.court_id,  // Store court_id in metadata for reference
        court_name: court.name,
        club_name: court.club.name,
        hourly_rate: applicablePrice,
        duration_hours: durationHours,
        price_breakdown: priceBreakdown  // Detailed price calculation breakdown
      }
    }

    console.log('bookingData', bookingData)

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert(bookingData)
      .select()
      .single()

    if (bookingError) {
      console.error(bookingError)
      return createErrorResponse(bookingError.message, 400)
    }

    // Create booked_slot record with court_id
    const bookedSlotData = {
      booking_id: booking.id,
      court_id: requestData.court_id,  // Store court_id in booked_slots
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: 'scheduled',
      price: totalAmount,
      expiry_at: moment().add(10, 'minutes').toISOString(),
      metadata: {
        booking_type: 'single',
        created_by: requestData.user_id
      }
    }

    const { error: slotError } = await supabase
      .from('booked_slots')
      .insert(bookedSlotData)

    if (slotError) {
      console.error('Error creating booked slot:', slotError)
      // Don't fail the entire operation if slot creation fails
    }

    // Return booking with court info
    const responseData = {
      ...booking,
      court: {
        id: court.id,
        name: court.name,
        hourly_rate: applicablePrice,
        club: court.club
      }
    }

    return createResponse(responseData, 201)

  } catch (error) {
    console.error('Error in create-booking function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})