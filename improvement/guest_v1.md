# Guest Management System - Version 1

## Tổng quan

Hiện tại hệ thống chỉ cho phép tạo booking cho Guest từ web quản lý nhưng thiếu khả năng quản lý và tái sử dụng thông tin Guest. Giải pháp này sẽ tạo ra hệ thống quản lý Guest hoàn chỉnh với tenant isolation.

## Phân tích hiện tại

### Vấn đề
- Booking hiện tại chỉ hỗ trợ user với `user_id`
- Guest booking lưu thông tin trong `metadata.customer_info` (không structured)
- Không thể quản lý và tái sử dụng thông tin guest
- Thiếu tenant isolation cho guest data
- Không có lịch sử booking cho từng guest

### Flow hiện tại
```
pc-create-booking → Booking (user_id + metadata.customer_info)
pc-confirm-booking → Payment + Teams/Matches (chỉ với user_id)
```

## Giải pháp kiến trúc

### 1. Database Schema Changes

#### Bảng Guests
```sql
CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id), -- Tenant isolation
  name varchar NOT NULL,
  phone varchar NOT NULL,
  notes text,
  metadata jsonb DEFAULT '{}', -- Lưu thông tin bổ sung
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id), -- Staff tạo guest
  
  -- Constraints
  CONSTRAINT unique_guest_phone_per_tenant UNIQUE(tenant_id, phone), 

  -- Indexes
  CREATE INDEX idx_guests_tenant_id ON guests(tenant_id),
  CREATE INDEX idx_guests_phone ON guests(phone),
  CREATE INDEX idx_guests_email ON guests(email),
  CREATE INDEX idx_guests_name ON guests(name),
  CREATE INDEX idx_guests_created_at ON guests(created_at)
);
```

#### Update Bookings Table
```sql
-- Thêm guest reference
ALTER TABLE public.bookings ADD COLUMN guest_id uuid;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_guest_id_fkey 
  FOREIGN KEY (guest_id) REFERENCES public.guests(id);

-- Ensure mutual exclusivity: có user_id HOẶC guest_id
ALTER TABLE public.bookings ADD CONSTRAINT bookings_user_or_guest_check 
  CHECK ((user_id IS NOT NULL) != (guest_id IS NOT NULL));

-- Index cho performance
CREATE INDEX idx_bookings_guest_id ON public.bookings(guest_id);
```

### 2. Frontend Integration với Supabase SDK

#### Guest Management qua Frontend
Thay vì tạo edge functions riêng cho guest management, FE sẽ tương tác trực tiếp với Supabase SDK:

```typescript
// Frontend Guest Operations với Supabase Client
import { createClient } from '@supabase/supabase-js'

// Tạo guest mới
const createGuest = async (guestData: CreateGuestData) => {
  const { data, error } = await supabase
    .from('guests')
    .insert({
      tenant_id: currentTenant.id,
      name: guestData.name,
      phone: guestData.phone,
      notes: guestData.notes,
      created_by: currentUser.id
    })
    .select()
    .single()
  
  return { data, error }
}

// Tìm kiếm guests
const searchGuests = async (query: string) => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', currentTenant.id)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(10)
  
  return { data, error }
}

// Tìm guest by phone (để check duplicate)
const findGuestByPhone = async (phone: string) => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', currentTenant.id)
    .eq('phone', phone)
    .maybeSingle()
  
  return { data, error }
}

// Update guest
const updateGuest = async (guestId: string, updates: UpdateGuestData) => {
  const { data, error } = await supabase
    .from('guests')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', guestId)
    .eq('tenant_id', currentTenant.id)
    .select()
    .single()
  
  return { data, error }
}

// Lấy guest booking history
const getGuestBookings = async (guestId: string) => {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booked_slots(*),
      clubs(name),
      courts(name)
    `)
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
  
  return { data, error }
}
```

#### Modified Booking APIs

```typescript
// pc-create-booking (updated) - chỉ nhận guest_id đã được tạo từ FE
POST /functions/v1/pc-create-booking
{
  court_id: string,
  start_time: string,
  end_time: string,
  booking_type?: 'single' | 'recurring',
  recurring_config?: RecurringConfig,
  
  // Chọn 1 trong 2 options (mutually exclusive):
  user_id?: string,    // Existing registered user
  guest_id?: string,   // Guest ID đã được tạo sẵn từ FE
}

// Response structure remains same but includes guest info
Response: {
  booking: Booking & {
    guest?: Guest,  // Include guest info if guest booking
    user?: User     // Include user info if user booking
  }
}
```

### 3. Frontend-First Architecture

#### Guest Management Service (Frontend)
```typescript
// GuestManagementService.ts - Frontend service
export class GuestManagementService {
  constructor(private supabase: SupabaseClient) {}
  
  // Tìm hoặc tạo guest (main workflow)
  async findOrCreateGuest(guestData: {
    name: string;
    phone: string;
    notes?: string;
  }): Promise<{ guest: Guest; isExisting: boolean }> {
    
    // 1. Tìm guest existing by phone
    const existing = await this.findGuestByPhone(guestData.phone);
    
    if (existing.data) {
      // 2a. Nếu có existing, optionally update info
      const shouldUpdate = existing.data.name !== guestData.name || 
                          existing.data.notes !== guestData.notes;
                          
      if (shouldUpdate) {
        const updated = await this.updateGuest(existing.data.id, {
          name: guestData.name,
          notes: guestData.notes
        });
        return { guest: updated.data!, isExisting: true };
      }
      
      return { guest: existing.data, isExisting: true };
    }
    
    // 2b. Nếu không có, tạo mới
    const created = await this.createGuest(guestData);
    return { guest: created.data!, isExisting: false };
  }
  
  // Validate guest belongs to tenant
  async validateGuestAccess(guestId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('guests')
      .select('id')
      .eq('id', guestId)
      .eq('tenant_id', this.currentTenant.id)
      .maybeSingle();
      
    return !!data;
  }
}
```

### 4. Business Logic Flow (Updated)

#### Frontend Guest Booking Flow
```
1. Web Admin UI Flow:
   - Select "Guest Booking" option
   - Input form: name (required), phone (required), notes (optional)
   - Khi nhập phone → debounced search existing guests
   - Nếu tìm thấy match → show suggestion với option "Use existing guest"
   - User có thể chọn existing guest hoặc create new

2. Pre-Booking Process (Frontend):
   - User fills guest info và submits
   - FE calls GuestManagementService.findOrCreateGuest()
   - Service returns guest_id (either existing or newly created)
   - FE now has guest_id để proceed với booking

3. Booking Creation (Edge Function):
   - FE calls pc-create-booking với guest_id
   - Edge function validates guest_id belongs to tenant
   - Create booking với guest_id (user_id = null)
   - Same flow: pricing, slots, cache (unchanged)

4. Booking Confirmation:
   - Same as current but skip team/match creation for guest bookings
   - Create payment record
   - Update slots status
```

#### Guest Management Flow
```
1. Guest Search & Management:
   - Tenant-scoped search by name, phone, email
   - Show guest list với booking count, last visit, total spent
   - Click guest → view detail với booking history
   - Quick actions: Call, Email, Create New Booking

2. Guest Auto-completion:
   - Khi nhập phone trong booking form → auto-suggest matching guests
   - Show: name, phone, last booking date
   - Select guest → pre-fill all info

3. Guest Data Enrichment:
   - Update guest info từ new bookings nếu có thông tin mới
   - Track booking patterns, preferences trong metadata
   - Calculate guest lifetime value
```

### 5. Data Migration Strategy

```sql
-- Step 1: Create guests table và related structures
-- Step 2: Migrate existing guest data
WITH guest_bookings AS (
  SELECT DISTINCT 
    b.id,
    b.club_id,
    c.tenant_id,
    b.metadata->>'customer_info'->>'name' as name,
    b.metadata->>'customer_info'->>'phone' as phone,
    b.metadata->>'customer_info'->>'email' as email,
    b.created_at
  FROM bookings b
  JOIN clubs c ON b.club_id = c.id
  WHERE b.user_id IS NULL 
    AND b.metadata->>'customer_info' IS NOT NULL
)
INSERT INTO guests (tenant_id, name, phone, email, created_at)
SELECT DISTINCT 
  tenant_id,
  name,
  phone,
  email,
  MIN(created_at)
FROM guest_bookings
WHERE name IS NOT NULL
GROUP BY tenant_id, name, phone, email;

-- Step 3: Update bookings với guest_id
UPDATE bookings 
SET guest_id = g.id
FROM guests g, clubs c
WHERE bookings.club_id = c.id
  AND g.tenant_id = c.tenant_id  
  AND bookings.user_id IS NULL
  AND g.phone = bookings.metadata->>'customer_info'->>'phone';

-- Step 4: Clean up metadata
UPDATE bookings 
SET metadata = metadata - 'customer_info'
WHERE guest_id IS NOT NULL;
```

### 6. Edge Functions Implementation (Simplified)

#### No New Functions Needed
Guest management được handle hoàn toàn bởi Frontend qua Supabase SDK.

#### Updated Functions Only
```
pc-create-booking/         - Handle guest_id parameter (instead of guest_info)
pc-confirm-booking/        - Skip team creation cho guest bookings
pc-get-available-slots/    - No changes needed
```

#### BookingOperationsService Update
```typescript
// Simplified service - chỉ cần validate guest_id
export class BookingOperationsService {
  async createBooking(data: CreateBookingData): Promise<Booking> {
    // Validate mutually exclusive user_id vs guest_id
    if (!!data.userId === !!data.guestId) {
      throw new Error('Must provide either user_id or guest_id, not both')
    }
    
    // Validate guest exists và belongs to tenant nếu là guest booking
    if (data.guestId) {
      const guestExists = await this.validateGuestAccess(data.guestId, data.tenantId)
      if (!guestExists) {
        throw new Error('Invalid guest_id or guest not found')
      }
    }
    
    // Proceed with booking creation (existing logic)
    const booking = await this.createBookingRecord({
      ...data,
      metadata: {
        ...data.metadata,
        is_guest_booking: !!data.guestId
      }
    })
    
    return booking
  }
  
  private async validateGuestAccess(guestId: string, tenantId: string): Promise<boolean> {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('guests')
      .select('id')
      .eq('id', guestId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
      
    return !!data
  }
}
```

### 7. TypeScript Types

```typescript
// Database types
export interface Guest {
  id: string
  tenant_id: string
  name: string
  phone?: string
  email?: string
  notes?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  created_by?: string
}

// Request/Response types
export interface CreateGuestRequest {
  name: string
  phone?: string
  email?: string
  notes?: string
}

export interface GuestSearchResponse {
  data: Guest[]
  total: number
  page: number
  limit: number
}

export interface GuestDetail extends Guest {
  bookings: BookingWithDetails[]
  stats: {
    total_bookings: number
    total_spent: number
    last_visit?: string
    avg_booking_value: number
  }
}

// Updated booking types (simplified)
export interface CreateBookingRequest {
  court_id: string
  start_time: string
  end_time: string
  booking_type?: 'single' | 'recurring'
  recurring_config?: RecurringConfig
  
  // Mutually exclusive - simplified
  user_id?: string    // Registered user booking
  guest_id?: string   // Guest booking (guest đã được tạo từ FE)
}
```

### 8. Security & Validation

#### Row Level Security
```sql
-- Guests chỉ access được trong tenant của mình
CREATE POLICY guests_tenant_isolation ON guests
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Bookings có thể access guest trong cùng tenant
CREATE POLICY bookings_guest_access ON bookings
  FOR ALL USING (
    guest_id IS NULL OR 
    EXISTS (
      SELECT 1 FROM guests g 
      WHERE g.id = guest_id 
        AND g.tenant_id = current_setting('app.tenant_id')::uuid
    )
  );
```

#### Validation Rules
```typescript
// Business validation
export class GuestValidationService {
  validateGuestCreation(data: CreateGuestRequest): void {
    if (!data.name?.trim()) throw new Error('Name is required')
    if (!data.phone && !data.email) throw new Error('Phone or email is required')
    if (data.phone && !this.isValidPhone(data.phone)) throw new Error('Invalid phone format')
    if (data.email && !this.isValidEmail(data.email)) throw new Error('Invalid email format')
  }
  
  validateGuestBooking(booking: CreateBookingRequest): void {
    const hasUser = !!booking.user_id
    const hasGuest = !!booking.guest_info
    
    if (hasUser === hasGuest) {
      throw new Error('Booking must have either user_id or guest_info, not both')
    }
    
    if (hasGuest && booking.guest_info) {
      const reuseExisting = !!booking.guest_info.guest_id
      const createNew = !!booking.guest_info.name
      
      if (!reuseExisting && !createNew) {
        throw new Error('Guest info must include guest_id (reuse) or name (create new)')
      }
    }
  }
}
```

### 9. UI/UX Considerations

#### Web Admin Interface Updates

```typescript
// 1. Guest Management Page
- Guest list với search, filter, pagination
- Columns: Name, Phone, Email, Bookings Count, Last Visit, Total Spent
- Actions: View Detail, Quick Call, New Booking, Edit
- Search by name, phone, email với debounced auto-complete

// 2. Booking Creation Form Updates
- Radio buttons: "Registered User" vs "Guest Booking"
- User section: existing user search dropdown
- Guest section: 
  - Phone input với auto-complete (show existing guests)
  - Name input (required)
  - Email input (optional)  
  - "Use existing guest" suggestions
  - Notes field

// 3. Guest Detail Page
- Basic information panel
- Booking history table với filters
- Statistics: total bookings, total spent, avg per booking
- Quick actions: Call, Email, Create New Booking
- Edit guest information
```

#### Mobile App Considerations
- Guest bookings sẽ không có mobile app access (chỉ web admin)
- Future: có thể cho phép guest check-in bằng phone number

### 10. Testing Strategy

```typescript
// Unit Tests
- GuestService methods
- Validation logic
- Data migration scripts
- Business rules (mutual exclusivity)

// Integration Tests  
- End-to-end booking flow với guests
- Guest search và reuse flow
- Tenant isolation
- Performance với large guest dataset

// Edge Cases
- Duplicate phone numbers across tenants
- Guest booking confirmation without teams
- Data consistency during migration
- Concurrent guest creation với same phone
```

### 11. Performance Considerations

```sql
-- Database indexes for common queries
CREATE INDEX idx_guests_tenant_search ON guests(tenant_id, name, phone, email);
CREATE INDEX idx_guests_bookings_stats ON bookings(guest_id, created_at, total_amount);

-- Query optimization
-- Guest search với full-text search nếu cần
ALTER TABLE guests ADD COLUMN search_vector tsvector;
CREATE INDEX idx_guests_search ON guests USING gin(search_vector);
```

### 12. Rollout Plan

#### Phase 1: Database Infrastructure
- Create guests table và migrations
- Setup Row Level Security policies
- Data migration scripts để chuyển existing guest data

#### Phase 2: Frontend Integration  
- Implement GuestManagementService trong frontend
- Update pc-create-booking function để handle guest_id
- Update pc-confirm-booking function để skip teams cho guests

#### Phase 3: Web Admin Integration
- Guest management UI
- Updated booking form
- Guest search và selection
- Booking history views

#### Phase 4: Data Migration & Testing
- Run migration scripts
- Comprehensive testing
- Performance optimization
- Documentation updates

## Kết luận

Giải pháp này sẽ:
✅ Tạo ra hệ thống quản lý Guest hoàn chỉnh với tenant isolation
✅ Cho phép tái sử dụng thông tin Guest across bookings  
✅ Maintain backward compatibility với existing bookings
✅ Provide rich guest analytics và insights
✅ Scale được với multi-tenant architecture
✅ Secure với proper validation và RLS policies

Next steps: Review và approval trước khi bắt đầu implementation.