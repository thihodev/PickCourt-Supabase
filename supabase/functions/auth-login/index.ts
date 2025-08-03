import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createResponse, createErrorResponse, corsHeaders, createSupabaseAdminClient } from '../_shared/utils.ts'

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  status: string
  data: {
    user: {
      id: string
      email: string
      name?: string
      avatar_url?: string
      roles: string[]
      permissions: string[]
      tenants: any[]
    }
    access_token: string
    token_type: string
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
    const requestData: LoginRequest = await req.json()

    // Validate required fields
    if (!requestData.email || !requestData.password) {
      return createErrorResponse('Missing required fields: email, password', 400)
    }

    const supabase = createSupabaseAdminClient()

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: requestData.email,
      password: requestData.password,
    })

    if (authError || !authData.user) {
      return createErrorResponse('Invalid email or password', 401)
    }

    // Get user details from custom users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        profile,
        tenant:tenants(
          id,
          name,
          slug
        )
      `)
      .eq('id', authData.user.id)
      .single()

    if (userError || !userData) {
      return createErrorResponse('User not found in system', 404)
    }

    // Prepare response data to match Laravel API format
    const responseData: LoginResponse = {
      status: 'success',
      data: {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.profile?.name || userData.email.split('@')[0],
          avatar_url: userData.profile?.avatar_url,
          roles: [userData.role],
          permissions: [], // TODO: Add permissions based on role
          tenants: userData.tenant ? [userData.tenant] : []
        },
        access_token: authData.session?.access_token || '',
        token_type: 'Bearer'
      }
    }

    return createResponse(responseData)

  } catch (error) {
    console.error('Error in auth-login function:', error)
    return createErrorResponse('Internal server error', 500)
  }
})