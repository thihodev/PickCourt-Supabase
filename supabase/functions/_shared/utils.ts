import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Database, ApiResponse, TenantContext, UserContext } from './types.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-user-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function createSupabaseClient() {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
}

export function createSupabaseAdminClient() {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

export function createResponse<T>(
  data: T,
  status = 200,
  headers = {},
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...headers,
    },
  });
}

export function createErrorResponse(
  error: string,
  status = 400,
  headers = {},
): Response {
  const response: ApiResponse = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...headers,
    },
  });
}

export async function getTenantFromRequest(req: Request): Promise<TenantContext | null> {
  const tenantId = req.headers.get('x-tenant-id');
  if (!tenantId) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    settings: data.settings || {},
  };
}

export async function getUserFromToken(req: Request, tenantId: string): Promise<UserContext | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Try NextAuth JWT token first (for Manager app)
  try {
    // For NextAuth tokens, we can decode the JWT to get user info
    // or use the X-User-ID header as a fallback
    const userIdHeader = req.headers.get('X-User-ID');
    
    if (userIdHeader) {
      const supabase = createSupabaseAdminClient();
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userIdHeader)
        .eq('tenant_id', tenantId)
        .single();

      if (!userError && userData) {
        return {
          id: userData.id,
          tenantId: userData.tenant_id,
          email: userData.email,
          role: userData.role,
          profile: userData.profile || {},
        };
      }
    }
  } catch (error) {
    console.log('NextAuth token validation failed, trying Supabase token...');
  }

  // Fallback to Supabase native token validation (for Client app)
  try {
    const supabase = createSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (userError || !userData) {
      return null;
    }

    return {
      id: userData.id,
      tenantId: userData.tenant_id,
      email: userData.email,
      role: userData.role,
      profile: userData.profile || {},
    };
  } catch (error) {
    console.log('Supabase token validation also failed');
    return null;
  }
}

export async function validateRequest(req: Request): Promise<{
  tenant: TenantContext;
  user: UserContext;
} | null> {
  const tenant = await getTenantFromRequest(req);
  if (!tenant) {
    return null;
  }

  const user = await getUserFromToken(req, tenant.id);
  if (!user) {
    return null;
  }

  return { tenant, user };
}

export function requireAuth(roles?: string[]) {
  return async (req: Request): Promise<{
    tenant: TenantContext;
    user: UserContext;
  } | Response> => {
    const context = await validateRequest(req);
    
    if (!context) {
      return createErrorResponse('Unauthorized', 401);
    }

    if (roles && !roles.includes(context.user.role)) {
      return createErrorResponse('Forbidden', 403);
    }

    return context;
  };
}

export function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return input.trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

export function formatDateTime(date: Date): string {
  return date.toISOString();
}

export function parseDateTime(dateString: string): Date {
  return new Date(dateString);
}