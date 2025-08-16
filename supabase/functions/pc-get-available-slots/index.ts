import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders,
  createAuthenticatedClient
} from '../_shared/utils.ts'
import { AvailableSlotsService } from '../../../src/services/AvailableSlotsService.ts'
import moment from 'npm:moment-timezone'

interface GetAvailableSlotsRequest {
  date_from?: string
  date_to?: string
  duration?: number // 60, 90, 120 minutes
  limit?: number
  offset?: number
  club_ids?: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse query parameters
    const url = new URL(req.url)
    const searchParams = url.searchParams

    const requestData: GetAvailableSlotsRequest = {
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      duration: searchParams.get('duration') ? parseInt(searchParams.get('duration')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      club_ids: searchParams.get('club_ids') ? searchParams.get('club_ids')!.split(',') : undefined
    }

    // Validate duration if provided
    if (requestData.duration && ![60, 90, 120].includes(requestData.duration)) {
      return createErrorResponse('Duration must be 60, 90, or 120 minutes', 400)
    }

    // Validate date formats if provided
    if (requestData.date_from && !moment(requestData.date_from, 'YYYY-MM-DD', true).isValid()) {
      return createErrorResponse('Invalid date_from format. Use YYYY-MM-DD', 400)
    }

    if (requestData.date_to && !moment(requestData.date_to, 'YYYY-MM-DD', true).isValid()) {
      return createErrorResponse('Invalid date_to format. Use YYYY-MM-DD', 400)
    }

    // Validate date range
    if (requestData.date_from && requestData.date_to) {
      const dateFrom = moment(requestData.date_from)
      const dateTo = moment(requestData.date_to)
      
      if (dateTo.isBefore(dateFrom)) {
        return createErrorResponse('date_to must be after date_from', 400)
      }

      // Limit to maximum 30 days range
      if (dateTo.diff(dateFrom, 'days') > 30) {
        return createErrorResponse('Date range cannot exceed 30 days', 400)
      }
    }

    // Validate limit and offset
    if (requestData.limit && (requestData.limit < 1 || requestData.limit > 100)) {
      return createErrorResponse('Limit must be between 1 and 100', 400)
    }

    if (requestData.offset && requestData.offset < 0) {
      return createErrorResponse('Offset must be non-negative', 400)
    }

    // Optional: Check authentication if needed
    // const supabase = createAuthenticatedClient(req)
    // const { data: user, error: authError } = await supabase.auth.getUser()
    //
    // if (authError || !user) {
    //   return createErrorResponse('Unauthorized', 401)
    // }

    // Initialize service
    const availableSlotsService = new AvailableSlotsService()

    // Get available slots
    const result = await availableSlotsService.getAvailableSlots({
      dateFrom: requestData.date_from,
      dateTo: requestData.date_to,
      duration: requestData.duration,
      limit: requestData.limit,
      offset: requestData.offset,
      clubIds: requestData.club_ids
    })

    // Return response with metadata
    const responseData = {
      ...result,
      filters: {
        date_from: requestData.date_from || moment().format('YYYY-MM-DD'),
        date_to: requestData.date_to || moment().add(10, 'days').format('YYYY-MM-DD'),
        duration: requestData.duration || 60,
        limit: requestData.limit || 50,
        offset: requestData.offset || 0,
        club_ids: requestData.club_ids || null
      },
      meta: {
        generated_at: new Date().toISOString(),
        total_slots: result.total,
        has_more: result.hasMore
      }
    }

    return createResponse(responseData)

  } catch (error) {
    console.error('Error in get-available-slots function:', error)
    
    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        return createErrorResponse('Database error', 500)
      }
      if (error.message.includes('Upstash')) {
        return createErrorResponse('Cache service unavailable', 503)
      }
    }

    return createErrorResponse('Internal server error', 500)
  }
})