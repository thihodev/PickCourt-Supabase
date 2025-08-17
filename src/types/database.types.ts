export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          domain: string | null
          settings: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          domain?: string | null
          settings?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          domain?: string | null
          settings?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      clubs: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          address: string | null
          phone: string | null
          email: string | null
          settings: Json | null
          status: string
          created_at: string
          updated_at: string
          opening_time: string
          closing_time: string
          timezone: string
          city: string | null
          district: string | null
          ward: string | null
          street_address: string | null
          postal_code: string | null
          latitude: number | null
          longitude: number | null
          website: string | null
          facebook: string | null
          instagram: string | null
          amenities: Json | null
          policies: Json | null
          contact_person: string | null
          emergency_contact: string | null
          business_license: string | null
          tax_id: string | null
          logo: string | null
          allow_half_hour_slots: boolean
          prevent_orphan_30min: boolean
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          settings?: Json | null
          status?: string
          created_at?: string
          updated_at?: string
          opening_time?: string
          closing_time?: string
          timezone?: string
          city?: string | null
          district?: string | null
          ward?: string | null
          street_address?: string | null
          postal_code?: string | null
          latitude?: number | null
          longitude?: number | null
          website?: string | null
          facebook?: string | null
          instagram?: string | null
          amenities?: Json | null
          policies?: Json | null
          contact_person?: string | null
          emergency_contact?: string | null
          business_license?: string | null
          tax_id?: string | null
          logo?: string | null
          allow_half_hour_slots?: boolean
          prevent_orphan_30min?: boolean
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          settings?: Json | null
          status?: string
          created_at?: string
          updated_at?: string
          opening_time?: string
          closing_time?: string
          timezone?: string
          city?: string | null
          district?: string | null
          ward?: string | null
          street_address?: string | null
          postal_code?: string | null
          latitude?: number | null
          longitude?: number | null
          website?: string | null
          facebook?: string | null
          instagram?: string | null
          amenities?: Json | null
          policies?: Json | null
          contact_person?: string | null
          emergency_contact?: string | null
          business_license?: string | null
          tax_id?: string | null
          logo?: string | null
          allow_half_hour_slots?: boolean
          prevent_orphan_30min?: boolean
        }
      }
      users: {
        Row: {
          id: string
          email: string | null
          profile: Json | null
          role: 'super_admin' | 'tenant_admin' | 'customer'
          tenant_id: string | null
          is_super_admin: boolean
          created_at: string
          updated_at: string
          phone: string | null
          full_name: string | null
          avatar_url: string | null
          level: number
          reliability: 'beginner' | 'intermediate' | 'advanced' | 'expert'
        }
        Insert: {
          id: string
          email?: string | null
          profile?: Json | null
          role?: 'super_admin' | 'tenant_admin' | 'customer'
          tenant_id?: string | null
          is_super_admin?: boolean
          created_at?: string
          updated_at?: string
          phone?: string | null
          full_name?: string | null
          avatar_url?: string | null
          level?: number
          reliability?: 'beginner' | 'amateur' | 'intermediate' | 'advanced' | 'professional' | 'certified'
        }
        Update: {
          id?: string
          email?: string | null
          profile?: Json | null
          role?: 'super_admin' | 'tenant_admin' | 'customer'
          tenant_id?: string | null
          is_super_admin?: boolean
          created_at?: string
          updated_at?: string
          phone?: string | null
          full_name?: string | null
          avatar_url?: string | null
          level?: number
          reliability?: 'beginner' | 'amateur' | 'intermediate' | 'advanced' | 'professional' | 'certified'
        }
      }
      courts: {
        Row: {
          id: string
          name: string
          type: string
          status: 'active' | 'maintenance' | 'inactive'
          settings: Json | null
          created_at: string
          updated_at: string
          club_id: string
        }
        Insert: {
          id?: string
          name: string
          type?: string
          status?: 'active' | 'maintenance' | 'inactive'
          settings?: Json | null
          created_at?: string
          updated_at?: string
          club_id: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          status?: 'active' | 'maintenance' | 'inactive'
          settings?: Json | null
          created_at?: string
          updated_at?: string
          club_id?: string
        }
      }
      court_prices: {
        Row: {
          id: string
          court_id: string
          day_of_week: number
          start_time: string
          end_time: string
          price: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          court_id: string
          day_of_week: number
          start_time: string
          end_time: string
          price: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          court_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          price?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bookings: {
        Row: {
          id: string
          club_id: string
          user_id: string
          start_time: string
          end_time: string
          status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          booking_type: 'single' | 'recurring' | 'membership'
          total_amount: number
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          user_id: string
          start_time: string
          end_time: string
          status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          booking_type?: 'single' | 'recurring' | 'membership'
          total_amount?: number
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          user_id?: string
          start_time?: string
          end_time?: string
          status?: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          booking_type?: 'single' | 'recurring' | 'membership'
          total_amount?: number
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          tenant_id: string
          booking_id: string
          amount: number
          payment_method: string
          transaction_id: string | null
          status: 'pending' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
          metadata: Json | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          booking_id: string
          amount: number
          payment_method: string
          transaction_id?: string | null
          status?: 'pending' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
          metadata?: Json | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          booking_id?: string
          amount?: number
          payment_method?: string
          transaction_id?: string | null
          status?: 'pending' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
          metadata?: Json | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      booked_slots: {
        Row: {
          id: string
          booking_id: string
          court_id: string
          start_time: string
          end_time: string
          status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          price: number
          metadata: Json | null
          match_id: string | null
          expiry_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          court_id: string
          start_time: string
          end_time: string
          status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          price?: number
          metadata?: Json | null
          match_id?: string | null
          expiry_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          court_id?: string
          start_time?: string
          end_time?: string
          status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
          price?: number
          metadata?: Json | null
          match_id?: string | null
          expiry_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          name: string | null
          player_one_id: string
          player_two_id: string
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          player_one_id: string
          player_two_id: string
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          player_one_id?: string
          player_two_id?: string
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          booking_id: string
          team_one_id: string
          team_two_id: string
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit'
          result: 'team_one_win' | 'team_two_win' | 'no_result' | null
          match_date: string | null
          duration_minutes: number | null
          notes: string | null
          metadata: Json | null
          type: string
          is_open: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          team_one_id: string
          team_two_id: string
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit'
          result?: 'team_one_win' | 'team_two_win' | 'no_result' | null
          match_date?: string | null
          duration_minutes?: number | null
          notes?: string | null
          metadata?: Json | null
          type?: string
          is_open?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          team_one_id?: string
          team_two_id?: string
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit'
          result?: 'team_one_win' | 'team_two_win' | 'no_result' | null
          match_date?: string | null
          duration_minutes?: number | null
          notes?: string | null
          metadata?: Json | null
          type?: string
          is_open?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      sets: {
        Row: {
          id: string
          match_id: string
          set_number: number
          team_one_score: number
          team_two_score: number
          winner_team_id: string | null
          notes: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          match_id: string
          set_number: number
          team_one_score?: number
          team_two_score?: number
          winner_team_id?: string | null
          notes?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          match_id?: string
          set_number?: number
          team_one_score?: number
          team_two_score?: number
          winner_team_id?: string | null
          notes?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_info: {
        Args: {}
        Returns: {
          user_id: string
          user_role: 'customer' | 'staff' | 'admin'
          tenant_id: string | null
          is_super_admin: boolean
        }[]
      }
      user_can_access_tenant: {
        Args: {
          p_user_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      user_role: 'super_admin' | 'tenant_admin' | 'customer'
      court_status: 'active' | 'maintenance' | 'inactive'
      booking_status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
      payment_status: 'pending' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
      booking_type: 'single' | 'recurring' | 'membership'
      booked_slot_status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired'
      match_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit'
      match_result: 'team_one_win' | 'team_two_win' | 'no_result'
      reliability_level: 'beginner' | 'amateur' | 'intermediate' | 'advanced' | 'professional' | 'certified'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for application
export type UserRole = Database['public']['Enums']['user_role']
export type CourtStatus = Database['public']['Enums']['court_status']
export type BookingStatus = Database['public']['Enums']['booking_status']
export type PaymentStatus = Database['public']['Enums']['payment_status']
export type BookingType = Database['public']['Enums']['booking_type']
export type BookedSlotStatus = Database['public']['Enums']['booked_slot_status']
export type MatchStatus = Database['public']['Enums']['match_status']
export type MatchResult = Database['public']['Enums']['match_result']
export type ReliabilityLevel = Database['public']['Enums']['reliability_level']

export type Tenant = Database['public']['Tables']['tenants']['Row']
export type TenantInsert = Database['public']['Tables']['tenants']['Insert']
export type TenantUpdate = Database['public']['Tables']['tenants']['Update']

export type Club = Database['public']['Tables']['clubs']['Row']
export type ClubInsert = Database['public']['Tables']['clubs']['Insert']
export type ClubUpdate = Database['public']['Tables']['clubs']['Update']

export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type Court = Database['public']['Tables']['courts']['Row']
export type CourtInsert = Database['public']['Tables']['courts']['Insert']
export type CourtUpdate = Database['public']['Tables']['courts']['Update']

export type CourtPrice = Database['public']['Tables']['court_prices']['Row']
export type CourtPriceInsert = Database['public']['Tables']['court_prices']['Insert']
export type CourtPriceUpdate = Database['public']['Tables']['court_prices']['Update']

export type Booking = Database['public']['Tables']['bookings']['Row']
export type BookingInsert = Database['public']['Tables']['bookings']['Insert']
export type BookingUpdate = Database['public']['Tables']['bookings']['Update']

export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type PaymentUpdate = Database['public']['Tables']['payments']['Update']

export type BookedSlot = Database['public']['Tables']['booked_slots']['Row']
export type BookedSlotInsert = Database['public']['Tables']['booked_slots']['Insert']
export type BookedSlotUpdate = Database['public']['Tables']['booked_slots']['Update']

export type Team = Database['public']['Tables']['teams']['Row']
export type TeamInsert = Database['public']['Tables']['teams']['Insert']
export type TeamUpdate = Database['public']['Tables']['teams']['Update']

export type Match = Database['public']['Tables']['matches']['Row']
export type MatchInsert = Database['public']['Tables']['matches']['Insert']
export type MatchUpdate = Database['public']['Tables']['matches']['Update']

export type Set = Database['public']['Tables']['sets']['Row']
export type SetInsert = Database['public']['Tables']['sets']['Insert']
export type SetUpdate = Database['public']['Tables']['sets']['Update']

// Function return types
export type CurrentUserInfo = Database['public']['Functions']['get_current_user_info']['Returns'][0]