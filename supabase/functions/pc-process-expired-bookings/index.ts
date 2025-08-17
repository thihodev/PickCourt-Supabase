import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createResponse,
  createErrorResponse,
  corsHeaders
} from '../_shared/utils.ts'
import { ExpiredBookingService } from '../../../src/services/ExpiredBookingService.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST requests (for scheduled functions)
  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    const startTime = Date.now()
    const now = new Date().toISOString()
    
    console.log(`🕐 Starting expired bookings cleanup at ${now}`)

    // Initialize service
    const expiredBookingService = new ExpiredBookingService()

    // Process expired bookings
    const result = await expiredBookingService.processExpiredBookings()

    if (result.expired_slots_count === 0) {
      console.log('✅ No expired slots found')
      return createResponse({
        message: 'No expired bookings to process',
        ...result,
        processing_time_ms: Date.now() - startTime
      })
    }

    console.log(`📋 Processed ${result.expired_slots_count} expired slots`)
    console.log(`📋 Updated ${result.expired_bookings_count} bookings to expired`)

    if (result.errors.length > 0) {
      console.warn('⚠️  Some errors occurred during processing:', result.errors)
    }

    // Final result
    const summary = {
      message: 'Expired bookings processed successfully',
      ...result,
      processing_time_ms: Date.now() - startTime,
      success: result.errors.length === 0
    }

    console.log('✅ Expired bookings cleanup completed:', summary)
    
    return createResponse(summary)

  } catch (error) {
    console.error('💥 Unexpected error in process-expired-bookings:', error)
    return createErrorResponse(`Internal server error: ${error.message}`, 500)
  }
})