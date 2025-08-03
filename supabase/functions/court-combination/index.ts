import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, requireAuth, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

interface CourtCombinationRequest {
  club_id: string
  start_time: string // ISO timestamp
  duration_hours: number // e.g., 1, 1.5, 2
}

interface AvailableCourt {
  id: string
  name: string
  hourly_rate: number
  total_price: number
  club: {
    id: string
    name: string
    tenant_id: string
  }
  time_details: {
    start_time: string
    end_time: string
    duration_hours: number
    date: string
  }
}

interface CombinationResponse {
  club_id: string
  requested_start_time: string
  requested_duration_hours: number
  available_courts: AvailableCourt[]
  total_available: number
  pricing_summary: {
    min_price: number
    max_price: number
    avg_price: number
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
    const requestData: CourtCombinationRequest = await req.json()

    // Validate required fields
    if (!requestData.club_id || !requestData.start_time || !requestData.duration_hours) {
      return createErrorResponse('Missing required fields: club_id, start_time, duration_hours', 400)
    }

    // Validate duration (0.5 to 8 hours, in 0.5 hour increments)
    if (requestData.duration_hours < 0.5 || requestData.duration_hours > 8 || 
        (requestData.duration_hours * 2) % 1 !== 0) {
      return createErrorResponse('Duration must be between 0.5-8 hours in 0.5 hour increments', 400)
    }

    // Validate and parse start time
    const startTime = new Date(requestData.start_time)
    if (isNaN(startTime.getTime())) {
      return createErrorResponse('Invalid start_time format', 400)
    }

    // Calculate end time
    const endTime = new Date(startTime.getTime() + (requestData.duration_hours * 60 * 60 * 1000))

    // Check if start time is in the future
    const now = new Date()
    if (startTime <= now) {
      return createErrorResponse('start_time must be in the future', 400)
    }

    // Check operating hours (6:00 - 22:00)
    const startHour = startTime.getHours() + (startTime.getMinutes() / 60)
    const endHour = endTime.getHours() + (endTime.getMinutes() / 60)

    if (startHour < 6 || endHour > 22) {
      return createErrorResponse('Booking time must be within operating hours (6:00 - 22:00)', 400)
    }

    // Check if booking spans multiple days
    const startDate = startTime.toDateString()
    const endDate = endTime.toDateString()
    if (startDate !== endDate) {
      return createErrorResponse('Booking cannot span multiple days', 400)
    }

    const supabase = createSupabaseAdminClient()

    // Get courts for the specified club
    const { data: courts, error: courtsError } = await supabase
      .from('courts')
      .select(`
        id,
        name,
        hourly_rate,
        status,
        club:clubs(
          id,
          name,
          tenant_id
        )
      `)
      .eq('club_id', requestData.club_id)
      .eq('status', 'active')

    if (courtsError) {
      return createErrorResponse(courtsError.message, 400)
    }

    if (!courts || courts.length === 0) {
      return createErrorResponse('No active courts found for this club', 404)
    }

    // Check if club belongs to user's tenant
    const tenantCourts = courts.filter(court => court.club?.tenant_id === tenant.id)
    if (tenantCourts.length === 0) {
      return createErrorResponse('Club not accessible', 403)
    }

    // Get conflicting bookings for the time range
    const { data: conflicts, error: conflictError } = await supabase
      .from('bookings')
      .select('court_id, start_time, end_time, status')
      .in('court_id', tenantCourts.map(c => c.id))
      .neq('status', 'cancelled')
      .or(`and(start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()})`)

    if (conflictError) {
      return createErrorResponse(conflictError.message, 400)
    }

    // Filter out courts with conflicts
    const conflictCourtIds = new Set(conflicts?.map(b => b.court_id) || [])
    const availableCourts = tenantCourts.filter(court => !conflictCourtIds.has(court.id))

    // Calculate pricing for each available court
    const courtsWithPricing: AvailableCourt[] = availableCourts.map(court => {
      const totalPrice = Math.round(court.hourly_rate * requestData.duration_hours)
      
      return {
        id: court.id,
        name: court.name,
        hourly_rate: court.hourly_rate,
        total_price: totalPrice,
        club: court.club,
        time_details: {
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration_hours: requestData.duration_hours,
          date: startTime.toISOString().split('T')[0]
        }
      }
    })

    // Sort by price (ascending)
    courtsWithPricing.sort((a, b) => a.total_price - b.total_price)

    // Calculate pricing summary
    const prices = courtsWithPricing.map(c => c.total_price)
    const pricingSummary = {
      min_price: prices.length > 0 ? Math.min(...prices) : 0,
      max_price: prices.length > 0 ? Math.max(...prices) : 0,
      avg_price: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
    }

    const response: CombinationResponse = {
      club_id: requestData.club_id,
      requested_start_time: requestData.start_time,
      requested_duration_hours: requestData.duration_hours,
      available_courts: courtsWithPricing,
      total_available: courtsWithPricing.length,
      pricing_summary: pricingSummary
    }

    return createResponse(response)

  } catch (error) {
    console.error('Error in court-combination function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})