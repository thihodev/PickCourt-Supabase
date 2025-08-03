import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

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

    // Validate time format and logic
    const startTime = new Date(requestData.start_time)
    const endTime = new Date(requestData.end_time)

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return createErrorResponse('Invalid date format for start_time or end_time', 400)
    }

    if (startTime >= endTime) {
      return createErrorResponse('start_time must be before end_time', 400)
    }

    // Check if start time is in the future
    const now = new Date()
    if (startTime <= now) {
      return createErrorResponse('start_time must be in the future', 400)
    }

    const supabase = createSupabaseAdminClient()

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

    // Check if booking time is within club operating hours
    if (court.club.opening_time && court.club.closing_time) {
      const timezone = court.club.timezone || 'Asia/Ho_Chi_Minh'
      
      // Convert booking times to club timezone
      const startTimeInClubTZ = new Date(startTime.toLocaleString("en-US", {timeZone: timezone}))
      const endTimeInClubTZ = new Date(endTime.toLocaleString("en-US", {timeZone: timezone}))
      
      // Extract time parts (HH:MM format)
      const startTimeStr = startTimeInClubTZ.toTimeString().substring(0, 5)
      const endTimeStr = endTimeInClubTZ.toTimeString().substring(0, 5)
      
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

    // Calculate total amount using court_prices
    const durationMs = endTime.getTime() - startTime.getTime()
    const durationHours = durationMs / (1000 * 60 * 60)
    
    // Get the day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = startTime.getDay()
    
    // Get time in HH:MM format
    const startTimeStr = startTime.toTimeString().substring(0, 5)
    const endTimeStr = endTime.toTimeString().substring(0, 5)
    
    // Find applicable price from court_prices table
    const { data: courtPrices, error: priceError } = await supabase
      .from('court_prices')
      .select('price, start_time, end_time')
      .eq('court_id', requestData.court_id)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .lte('start_time', startTimeStr)
      .gte('end_time', endTimeStr)
      .order('start_time')
    
    if (priceError) {
      return createErrorResponse(`Error fetching court prices: ${priceError.message}`, 400)
    }
    
    if (!courtPrices || courtPrices.length === 0) {
      return createErrorResponse('No pricing available for the selected time slot', 400)
    }
    
    // Use the first matching price (could be enhanced to handle overlapping time slots)
    const applicablePrice = courtPrices[0].price
    const totalAmount = Math.round(applicablePrice * durationHours)

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
        duration_hours: durationHours
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