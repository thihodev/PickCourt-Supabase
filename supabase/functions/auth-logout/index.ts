import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405)
  }

  try {
    // Get authorization header
    const authorization = req.headers.get('Authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return createErrorResponse('Missing or invalid authorization header', 401)
    }

    const token = authorization.replace('Bearer ', '')
    const supabase = createSupabaseAdminClient()

    // Sign out user
    const { error } = await supabase.auth.admin.signOut(token)

    if (error) {
      console.error('Logout error:', error)
      // Don't fail if logout has issues, just log it
    }

    return createResponse({ 
      status: 'success',
      message: 'Logged out successfully' 
    })

  } catch (error) {
    console.error('Error in auth-logout function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})