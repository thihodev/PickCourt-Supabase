// Database types
export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          domain?: string;
          settings?: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          domain?: string;
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          domain?: string;
          settings?: Record<string, any>;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: 'admin' | 'staff' | 'customer';
          profile?: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role: 'admin' | 'staff' | 'customer';
          profile?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          email?: string;
          role?: 'admin' | 'staff' | 'customer';
          profile?: Record<string, any>;
          updated_at?: string;
        };
      };
      courts: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          type: string;
          hourly_rate: number;
          settings?: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          type: string;
          hourly_rate: number;
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          name?: string;
          type?: string;
          hourly_rate?: number;
          settings?: Record<string, any>;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          tenant_id: string;
          court_id: string;
          user_id: string;
          start_time: string;
          end_time: string;
          status: 'pending' | 'confirmed' | 'cancelled';
          booking_type: 'single' | 'recurring' | 'membership';
          total_amount: number;
          metadata?: Record<string, any>;
          created_at: string;
          updated_at: string;
          recurring_config?: Record<string, any>;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          court_id: string;
          user_id: string;
          start_time: string;
          end_time: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          booking_type: 'single' | 'recurring' | 'membership';
          total_amount: number;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
          recurring_config?: Record<string, any>;
        };
        Update: {
          court_id?: string;
          user_id?: string;
          start_time?: string;
          end_time?: string;
          status?: 'pending' | 'confirmed' | 'cancelled';
          booking_type?: 'single' | 'recurring' | 'membership';
          total_amount?: number;
          metadata?: Record<string, any>;
          updated_at?: string;
          recurring_config?: Record<string, any>;
        };
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          type: 'equipment' | 'membership' | 'service';
          price: number;
          settings?: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          type: 'equipment' | 'membership' | 'service';
          price: number;
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          name?: string;
          type?: 'equipment' | 'membership' | 'service';
          price?: number;
          settings?: Record<string, any>;
          updated_at?: string;
        };
      };
    };
  };
}

// Common request/response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// Booking related types
export interface BookingRequest {
  courtId: string;
  startTime: string;
  endTime: string;
  bookingType: 'single' | 'recurring' | 'membership';
  metadata?: Record<string, any>;
}

export interface RecurringBookingRequest extends BookingRequest {
  recurrencePattern: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate: string;
    daysOfWeek?: number[];
  };
}

// Pricing types
export interface PricingRule {
  id: string;
  name: string;
  type: 'peak_hours' | 'day_of_week' | 'duration' | 'membership';
  conditions: Record<string, any>;
  multiplier: number;
  fixed_amount?: number;
  priority: number;
}

export interface PricingCalculation {
  basePrice: number;
  appliedRules: PricingRule[];
  adjustments: Array<{
    rule: string;
    amount: number;
    type: 'multiplier' | 'fixed';
  }>;
  totalPrice: number;
}

// Tenant context
export interface TenantContext {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
}

// User context
export interface UserContext {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  profile: Record<string, any>;
}