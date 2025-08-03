// Re-export all types from models and database.types
export * from './models';
export * from './database.types';

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
  bookingType: 'single' | 'recurring';
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
  type: 'peak_hours' | 'day_of_week' | 'duration';
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

// Context types
export interface TenantContext {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
}

export interface UserContext {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  profile: Record<string, any>;
}