export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type BookingType = 'single' | 'recurring';
export type CourtStatus = 'active' | 'inactive' | 'maintenance';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type UserRole = 'customer' | 'staff' | 'admin';
export type BookedSlotStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeit';
export type MatchResult = 'team_one_win' | 'team_two_win' | 'draw' | 'no_result';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  profile: Record<string, any>;
  role: UserRole;
  tenant_id?: string;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  settings: Record<string, any>;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  opening_time: string;
  closing_time: string;
  timezone: string;
  city?: string;
  district?: string;
  ward?: string;
  street_address?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  facebook?: string;
  instagram?: string;
  amenities: any[];
  policies: Record<string, any>;
  contact_person?: string;
  emergency_contact?: string;
  business_license?: string;
  tax_id?: string;
  logo?: string;
  allow_half_hour_slots: boolean;
  prevent_orphan_30min: boolean;
}

export interface Court {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: CourtStatus;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  club_id?: string;
}

export interface CourtPrice {
  id: string;
  court_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  tenant_id: string;
  court_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  booking_type: BookingType;
  total_amount: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  booking_id: string;
  amount: number;
  payment_method: string;
  transaction_id?: string;
  status: PaymentStatus;
  metadata: Record<string, any>;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BookedSlot {
  id: string;
  booking_id: string;
  court_id: string;
  start_time: string;
  end_time: string;
  status: BookedSlotStatus;
  price: number;
  metadata: Record<string, any>;
  match_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  tenant_id: string;
  name?: string;
  player_one_id: string;
  player_two_id: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  tenant_id: string;
  booking_id: string;
  team_one_id: string;
  team_two_id: string;
  status: MatchStatus;
  result?: MatchResult;
  match_date?: string;
  duration_minutes?: number;
  notes?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Set {
  id: string;
  match_id: string;
  set_number: number;
  team_one_score: number;
  team_two_score: number;
  is_completed: boolean;
  winner_team_id?: string;
  notes?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}