# PC Create Booking Edge Function

## Overview
Edge function để tạo booking cho court tennis/badminton. Hỗ trợ cả booking cho registered users và guests, với single booking (1 lần) và recurring booking (lặp lại theo lịch).

**⚠️ BREAKING CHANGES v2.0 - Guest Management Support**

**URL:** `/functions/v1/pc-create-booking`  
**Method:** `POST`  
**Auth:** Required (Bearer token)

## What's New in v2.0

### Guest Bookings Support
- **Guest Management**: Hỗ trợ tạo booking cho guests (không cần registered user account)
- **Frontend-First**: Guests được tạo và quản lý từ frontend thông qua Supabase SDK
- **Tenant Isolation**: Guests được isolated theo tenant, đảm bảo security
- **No Teams/Matches**: Guest bookings không tạo teams/matches (guests không chơi matches)

### API Changes
- **Mutually Exclusive**: `user_id` và `guest_id` là mutually exclusive (chỉ được cung cấp 1 trong 2)
- **Guest Validation**: System validate guest thuộc cùng tenant với club
- **Removed**: `customer_info` object (thay thế bởi guest management system)

## Request Format

### Headers
```
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json
```

### Request Body

#### User Booking (unchanged)
```json
{
  "court_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001", 
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "booking_type": "single",
  "notes": "Birthday party booking"
}
```

#### Guest Booking (NEW)
```json
{
  "court_id": "550e8400-e29b-41d4-a716-446655440000",
  "guest_id": "550e8400-e29b-41d4-a716-446655440002", 
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "booking_type": "single",
  "notes": "Guest booking for John Doe"
}
```

#### Recurring Guest Booking (NEW)
```json
{
  "court_id": "550e8400-e29b-41d4-a716-446655440000",
  "guest_id": "550e8400-e29b-41d4-a716-446655440002",
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "booking_type": "recurring",
  "recurring_config": {
    "frequency": "weekly",
    "interval": 1,
    "days_of_week": [1, 3, 5],
    "occurrences": 8
  },
  "notes": "Weekly training for guest"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `court_id` | string (UUID) | ✅ | ID của court muốn book |
| `user_id` | string (UUID) | ❌* | ID của registered user (*required nếu không có guest_id) |
| `guest_id` | string (UUID) | ❌* | ID của guest (*required nếu không có user_id) |
| `start_time` | string (ISO) | ✅ | Thời gian bắt đầu |
| `end_time` | string (ISO) | ✅ | Thời gian kết thúc |
| `booking_type` | string | ❌ | "single" hoặc "recurring" (default: "single") |
| `recurring_config` | object | ❌** | Config cho recurring booking (**required nếu booking_type="recurring") |
| `notes` | string | ❌ | Ghi chú cho booking |

⚠️ **Important**: Must provide exactly one of `user_id` or `guest_id`, never both or none.

### Recurring Config Fields (unchanged)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frequency` | string | ✅ | "daily", "weekly", "monthly" |
| `interval` | number | ✅ | Khoảng cách giữa các lần |
| `days_of_week` | number[] | ✅* | Required nếu frequency="weekly" |
| `occurrences` | number | ❌ | Số lần lặp lại (alternative với end_date) |
| `end_date` | string (ISO) | ❌ | Ngày kết thúc (alternative với occurrences) |

## Response Format

### Success Response (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "club_id": "club-uuid",
    "user_id": "user-uuid", // null for guest bookings
    "guest_id": "guest-uuid", // null for user bookings  
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T12:00:00Z",
    "status": "pending",
    "booking_type": "single",
    "total_amount": 100000,
    "metadata": {
      "notes": "Guest booking for John Doe",
      "court_id": "court-uuid",
      "court_name": "Court 1",
      "club_name": "ABC Tennis Club",
      "slots_count": 1,
      "is_guest_booking": true
    },
    "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-10T08:00:00Z",
    
    "court": {
      "id": "court-uuid",
      "name": "Court 1",
      "club": {
        "id": "club-uuid", 
        "name": "ABC Tennis Club"
      }
    },
    
    "slots_info": {
      "count": 1,
      "total_amount": 100000,
      "booking_type": "single"
    }
  }
}
```

### Error Responses

#### 400 Bad Request - Mutually Exclusive Error (NEW)
```json
{
  "success": false,
  "error": "Must provide either user_id or guest_id, not both"
}
```

#### 400 Bad Request - Guest Access Error (NEW) 
```json
{
  "success": false,
  "error": "Guest not found or does not belong to this tenant"
}
```

#### Other error responses remain the same as v1

## Frontend Integration

### Prerequisites: Guest Management

Before creating guest bookings, frontend must create guests using Supabase SDK:

```typescript
// Guest Management Service Example
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// Create guest
const createGuest = async (guestData: {
  name: string;
  phone: string; 
  notes?: string;
}) => {
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

// Find existing guest
const findGuest = async (phone: string) => {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', currentTenant.id)
    .eq('phone', phone)
    .maybeSingle()
    
  return { data, error }
}
```

### Guest Booking Workflow

```typescript
// 1. Find or create guest
const handleGuestBooking = async (bookingData: {
  courtId: string;
  startTime: string;
  endTime: string;
  guestInfo: {
    name: string;
    phone: string;
    notes?: string;
  }
}) => {
  // Step 1: Check if guest exists
  const existingGuest = await findGuest(bookingData.guestInfo.phone)
  
  let guestId: string
  
  if (existingGuest.data) {
    guestId = existingGuest.data.id
    // Optionally update guest info
  } else {
    // Step 2: Create new guest
    const newGuest = await createGuest(bookingData.guestInfo)
    if (newGuest.error) throw new Error('Failed to create guest')
    guestId = newGuest.data.id
  }
  
  // Step 3: Create booking with guest_id
  const booking = await createBooking({
    court_id: bookingData.courtId,
    guest_id: guestId,  // Use guest_id instead of user_id
    start_time: bookingData.startTime,
    end_time: bookingData.endTime
  })
  
  return booking
}
```

### Updated Booking Function

```typescript
interface CreateBookingRequest {
  court_id: string
  user_id?: string    // For registered users
  guest_id?: string   // For guests (mutually exclusive with user_id)
  start_time: string
  end_time: string
  booking_type?: 'single' | 'recurring'
  recurring_config?: RecurringConfig
  notes?: string
}

async function createBooking(data: CreateBookingRequest) {
  // Validation
  if (!!data.user_id === !!data.guest_id) {
    throw new Error('Must provide either user_id or guest_id, not both')
  }
  
  const response = await fetch('/functions/v1/pc-create-booking', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }
  
  return response.json()
}
```

### Complete Guest Booking Example

```typescript
// Complete guest booking flow
const bookGuestCourt = async () => {
  try {
    // 1. Collect guest info from form
    const guestInfo = {
      name: "John Doe",
      phone: "0123456789",
      notes: "Regular customer"
    }
    
    // 2. Find or create guest
    let guest = await findGuest(guestInfo.phone)
    
    if (!guest.data) {
      guest = await createGuest(guestInfo)
    }
    
    // 3. Create booking
    const booking = await createBooking({
      court_id: 'court-uuid',
      guest_id: guest.data.id,
      start_time: '2024-01-15T10:00:00Z',
      end_time: '2024-01-15T12:00:00Z',
      notes: 'Birthday party for John'
    })
    
    console.log('Guest booking created:', booking)
    
    // 4. Next: Call pc-confirm-booking to confirm
    
  } catch (error) {
    console.error('Guest booking failed:', error)
  }
}
```

## Business Logic Changes

### Workflow (Updated)
1. **Validation**: Validate required fields + mutually exclusive user_id/guest_id
2. **Authentication**: Verify JWT token  
3. **Guest Validation**: If guest_id provided, validate guest exists and belongs to tenant
4. **Court Validation**: Check court exists và operating hours
5. **Slot Generation & Conflict Check**: Same as before
6. **Pricing**: Calculate total amount (same logic)
7. **Database Operations**: Create booking with user_id OR guest_id
8. **Cache**: Add reserved slots (same as before)

### Key Differences for Guest Bookings
- **No Teams/Matches**: Guest bookings skip team/match creation in pc-confirm-booking
- **Guest Validation**: Additional validation layer to ensure tenant isolation
- **Metadata**: `is_guest_booking: true` flag in metadata

## Migration Guide

### For Existing Frontend Code

1. **No breaking changes for user bookings** - existing code continues to work
2. **New guest booking flow**:
   - Add guest management UI/logic
   - Use Supabase SDK to create/manage guests
   - Pass `guest_id` instead of `customer_info`

### Database Changes
- Added `guest_id` column to bookings table
- Added mutual exclusivity constraint
- Added guest validation in BookingOperationsService

### Testing

Update test cases to include:
1. **Guest booking validation**
2. **Mutual exclusivity checks** 
3. **Guest tenant isolation**
4. **Guest booking confirmation flow**

```typescript
// Test cases
const testGuestBooking = {
  court_id: 'test-court-uuid',
  guest_id: 'test-guest-uuid', // Must be created first
  start_time: '2024-02-01T10:00:00Z',
  end_time: '2024-02-01T12:00:00Z'
}

const testInvalidBooking = {
  court_id: 'test-court-uuid', 
  user_id: 'test-user-uuid',
  guest_id: 'test-guest-uuid', // Should fail - both provided
  start_time: '2024-02-01T10:00:00Z',
  end_time: '2024-02-01T12:00:00Z'
}
```

## Next Steps

1. **Create guests using Supabase SDK** before booking
2. **Update booking form** to handle guest vs user selection
3. **Test guest booking confirmation** with pc-confirm-booking
4. **Implement guest search/reuse** functionality in UI