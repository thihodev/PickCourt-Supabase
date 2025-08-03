import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, requireAuth, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

interface CourtAvailabilityRequest {
  date: string
  club_id?: string
}

interface TimeFrame {
  start_time: string
  end_time: string
  duration_hours: number
  available_courts: number
  total_courts: number
  courts: {
    id: string
    name: string
    hourly_rate: number
    available: boolean
    booking_id?: string
  }[]
}

interface AvailabilityResponse {
  date: string
  club_id?: string
  total_courts: number
  time_frames: TimeFrame[]
  summary: {
    operating_hours: string
    peak_hours: string[]
    most_available_time: string
    least_available_time: string
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
    const auth = requireAuth(['super_admin', 'admin', 'customer'])
    const context = await auth(req)

    if (context instanceof Response) {
      return context
    }

    const { tenant, user } = context
    const requestData: CourtAvailabilityRequest = await req.json()

    if (!requestData.date) {
      return createErrorResponse('Missing required field: date', 400)
    }

    const supabase = createSupabaseAdminClient()

    // Build courts query
    let courtsQuery = supabase
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
      .eq('status', 'active')

    // Filter by club if specified
    if (requestData.club_id) {
      courtsQuery = courtsQuery.eq('club_id', requestData.club_id)
    }

    const { data: courts, error: courtsError } = await courtsQuery

    if (courtsError) {
      return createErrorResponse(courtsError.message, 400)
    }

    // Filter courts by tenant
    const tenantCourts = courts.filter(court => court.club?.tenant_id === tenant.id)

    if (tenantCourts.length === 0) {
      return createResponse({
        date: requestData.date,
        club_id: requestData.club_id,
        total_courts: 0,
        time_frames: [],
        summary: {
          operating_hours: `${openingTime} - ${closingTime}`,
          peak_hours: [],
          most_available_time: "",
          least_available_time: ""
        }
      })
    }

    // Get club operating hours (use first court's club, assuming all courts belong to same club)
    const firstClub = tenantCourts[0]?.club
    const openingTime = firstClub?.opening_time || '06:00'
    const closingTime = firstClub?.closing_time || '22:00'
    
    // Parse opening/closing hours to get hour numbers
    const openingHour = parseInt(openingTime.split(':')[0])
    const closingHour = parseInt(closingTime.split(':')[0])

    // Get bookings for the specified date
    const startOfDay = `${requestData.date}T00:00:00Z`
    const endOfDay = `${requestData.date}T23:59:59Z`

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, court_id, start_time, end_time, status')
      .in('court_id', tenantCourts.map(c => c.id))
      .gte('start_time', startOfDay)
      .lte('end_time', endOfDay)
      .neq('status', 'cancelled')

    if (bookingsError) {
      return createErrorResponse(bookingsError.message, 400)
    }

    // Generate time frames based on club operating hours
    const timeFrames: TimeFrame[] = []
    const totalCourts = tenantCourts.length

    for (let hour = openingHour; hour < closingHour; hour++) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`
      const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`
      
      // Check availability for each court in this time frame
      const frameSlotStart = new Date(`${requestData.date}T${startTime}:00Z`)
      const frameSlotEnd = new Date(`${requestData.date}T${endTime}:00Z`)
      
      const courtsInFrame = tenantCourts.map(court => {
        const courtBookings = bookings.filter(b => b.court_id === court.id)
        
        const conflictingBooking = courtBookings.find(booking => {
          const bookingStart = new Date(booking.start_time)
          const bookingEnd = new Date(booking.end_time)
          
          return (
            (frameSlotStart >= bookingStart && frameSlotStart < bookingEnd) ||
            (frameSlotEnd > bookingStart && frameSlotEnd <= bookingEnd) ||
            (frameSlotStart <= bookingStart && frameSlotEnd >= bookingEnd)
          )
        })

        return {
          id: court.id,
          name: court.name,
          hourly_rate: court.hourly_rate,
          available: !conflictingBooking,
          booking_id: conflictingBooking?.id
        }
      })

      const availableCourts = courtsInFrame.filter(c => c.available).length

      timeFrames.push({
        start_time: startTime,
        end_time: endTime,
        duration_hours: 1,
        available_courts: availableCourts,
        total_courts: totalCourts,
        courts: courtsInFrame
      })
    }

    // Calculate summary statistics
    const availabilityCounts = timeFrames.map(tf => tf.available_courts)
    const maxAvailable = Math.max(...availabilityCounts)
    const minAvailable = Math.min(...availabilityCounts)
    
    const mostAvailableFrames = timeFrames.filter(tf => tf.available_courts === maxAvailable)
    const leastAvailableFrames = timeFrames.filter(tf => tf.available_courts === minAvailable)
    
    // Peak hours (times with less than 50% availability)
    const peakThreshold = Math.ceil(totalCourts * 0.5)
    const peakHours = timeFrames
      .filter(tf => tf.available_courts < peakThreshold)
      .map(tf => `${tf.start_time}-${tf.end_time}`)

    const response: AvailabilityResponse = {
      date: requestData.date,
      club_id: requestData.club_id,
      total_courts: totalCourts,
      time_frames: timeFrames,
      summary: {
        operating_hours: `${openingTime} - ${closingTime}`,
        peak_hours: peakHours,
        most_available_time: mostAvailableFrames.length > 0 ? 
          `${mostAvailableFrames[0].start_time} (${maxAvailable}/${totalCourts} courts)` : "",
        least_available_time: leastAvailableFrames.length > 0 ? 
          `${leastAvailableFrames[0].start_time} (${minAvailable}/${totalCourts} courts)` : ""
      }
    }

    return createResponse(response)

  } catch (error) {
    console.error('Error in court-availability function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})