# PC Confirm Booking Edge Function

## Overview
Edge function để confirm booking đã được tạo, chuyển từ status "pending" thành "confirmed". Hỗ trợ cả user bookings và guest bookings với logic khác biệt.

**⚠️ UPDATED v2.0 - Guest Booking Support**

**URL:** `/functions/v1/pc-confirm-booking`  
**Method:** `POST`  
**Auth:** Required (Bearer token)

## What's New in v2.0

### Guest Booking Handling
- **Skip Teams/Matches**: Guest bookings không tạo teams và matches (guests không chơi matches)
- **Same Payment Flow**: Guest bookings vẫn tạo payment records như user bookings
- **Automatic Detection**: Function tự động detect guest booking qua `guest_id` field

### Key Differences
- **User Bookings**: Confirm → Create Teams → Create Matches → Create Payment
- **Guest Bookings**: Confirm → Create Payment (skip teams/matches)

## Request Format

### Headers
```
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json
```

### Request Body (unchanged)
```json
{
  "booking_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "payment_method": "pay_at_club",
  "payment_reference": "REF123456789",
  "notes": "Confirmed and ready to play"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `booking_id` | string (UUID) | ✅ | ID của booking cần confirm |
| `user_id` | string (UUID) | ✅ | ID của user confirm booking |
| `payment_method` | string | ❌ | Payment method (default: "pay_at_club") |
| `payment_reference` | string | ❌ | Reference number cho payment |
| `notes` | string | ❌ | Ghi chú khi confirm |

**Note**: `user_id` trong request là user đang confirm booking (có thể là staff), không phải user của booking.

## Response Format

### Success Response - User Booking (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "club_id": "club-uuid",
    "user_id": "user-uuid",
    "guest_id": null,
    "status": "confirmed",
    "booking_type": "single",
    "total_amount": 100000,
    "metadata": {
      "confirmation_notes": "Confirmed and ready to play",
      "payment_method": "pay_at_club",
      "payment_reference": "REF123456789",
      "confirmed_at": "2024-01-10T09:00:00Z",
      "confirmed_by": "confirming-user-uuid"
    },
    
    "message": "Booking confirmed successfully",
    "matches_created": 1,      // Number of matches created
    "teams_created": 2,        // Number of teams created  
    "slots_processed": 1,      // Number of slots confirmed
    "booking_type": "single",
    "payment_method": "pay_at_club",
    "payment_status": "pending",
    
    "slots_summary": [
      {
        "slot_id": "slot-uuid",
        "start_time": "2024-01-15T10:00:00Z",
        "end_time": "2024-01-15T12:00:00Z", 
        "price": 100000,
        "status": "confirmed"
      }
    ]
  }
}
```

### Success Response - Guest Booking (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "club_id": "club-uuid", 
    "user_id": null,
    "guest_id": "guest-uuid",
    "status": "confirmed",
    "booking_type": "single",
    "total_amount": 100000,
    "metadata": {
      "confirmation_notes": "Guest booking confirmed",
      "payment_method": "pay_at_club", 
      "is_guest_booking": true
    },
    
    "message": "Booking confirmed successfully",
    "matches_created": 0,      // No matches for guest bookings
    "teams_created": 0,        // No teams for guest bookings
    "slots_processed": 1,
    "booking_type": "single",
    "payment_method": "pay_at_club",
    "payment_status": "pending",
    
    "slots_summary": [
      {
        "slot_id": "slot-uuid",
        "start_time": "2024-01-15T10:00:00Z", 
        "end_time": "2024-01-15T12:00:00Z",
        "price": 100000,
        "status": "confirmed"
      }
    ]
  }
}
```

### Error Responses

#### 400 Bad Request - Missing Fields
```json
{
  "success": false,
  "error": "Missing required fields: booking_id"
}
```

#### 401 Unauthorized  
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

#### 404 Not Found - Booking
```json
{
  "success": false, 
  "error": "Booking not found"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Business Logic

### Confirmation Workflow

1. **Validation**: Validate booking exists and can be confirmed
2. **Update Booking Status**: Change status from "pending" to "confirmed"
3. **Update Booked Slots**: Update all related slots to "confirmed"
4. **Remove from Cache**: Remove reserved slots from Redis cache
5. **Add to Cache**: Add confirmed slots to Upstash cache
6. **Conditional Teams/Matches**: 
   - **User Bookings**: Create teams and matches for each slot
   - **Guest Bookings**: Skip teams/matches creation
7. **Create Payment**: Create payment record với specified method

### User vs Guest Booking Detection

```typescript
// System automatically detects booking type
if (booking.user_id && !booking.guest_id) {
  // User booking - create teams & matches
  await createTeamsAndMatches(booking)
} else if (booking.guest_id && !booking.user_id) {
  // Guest booking - skip teams & matches
  console.log('Skipping match creation for guest booking')
} else {
  // This should not happen due to database constraints
  throw new Error('Invalid booking state')
}
```

### Teams & Matches Creation (User Bookings Only)

For each booked slot in user bookings:
1. **Create 2 Teams**: Team One và Team Two cho match
2. **Create 1 Match**: Link 2 teams với court, date, và booking
3. **Update Slot**: Add match_id vào booked_slot record

**Example**: Recurring booking với 4 slots = 8 teams + 4 matches

### Payment Creation (Both Types)

All confirmed bookings get payment records:
- **Default Method**: "pay_at_club"
- **Status**: "pending" for pay_at_club, "completed" for others
- **Amount**: Total booking amount
- **Reference**: Custom reference or auto-generated

## Frontend Integration

### Confirm User Booking
```typescript
const confirmUserBooking = async (bookingId: string) => {
  const response = await fetch('/functions/v1/pc-confirm-booking', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      booking_id: bookingId,
      user_id: currentUser.id,
      payment_method: 'pay_at_club',
      notes: 'Ready to play'
    })
  })
  
  const result = await response.json()
  
  if (result.success) {
    console.log(`User booking confirmed!`)
    console.log(`Teams created: ${result.data.teams_created}`)
    console.log(`Matches created: ${result.data.matches_created}`)
  }
  
  return result
}
```

### Confirm Guest Booking
```typescript
const confirmGuestBooking = async (bookingId: string) => {
  const response = await fetch('/functions/v1/pc-confirm-booking', {
    method: 'POST', 
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      booking_id: bookingId,
      user_id: currentUser.id, // Staff confirming
      payment_method: 'cash',
      notes: 'Guest booking confirmed'
    })
  })
  
  const result = await response.json()
  
  if (result.success) {
    console.log(`Guest booking confirmed!`)
    console.log(`No teams/matches created (guest booking)`)
    console.log(`Payment method: ${result.data.payment_method}`)
  }
  
  return result
}
```

### Universal Confirm Function
```typescript
const confirmBooking = async (bookingId: string, options?: {
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) => {
  const response = await fetch('/functions/v1/pc-confirm-booking', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      booking_id: bookingId,
      user_id: currentUser.id,
      payment_method: options?.paymentMethod || 'pay_at_club',
      payment_reference: options?.paymentReference,
      notes: options?.notes
    })
  })
  
  const result = await response.json()
  
  // Handle both user and guest bookings
  if (result.success) {
    if (result.data.guest_id) {
      console.log('Guest booking confirmed - no matches created')
    } else {
      console.log(`User booking confirmed - ${result.data.matches_created} matches created`)
    }
  }
  
  return result
}
```

## Key Changes from v1.0

### What's the Same
- **Request format**: No changes to API contract
- **Authentication**: Same JWT requirement
- **Payment creation**: Same payment logic
- **Booking status updates**: Same status transitions
- **Cache management**: Same Redis operations

### What's Different  
- **Conditional logic**: Teams/matches creation depends on booking type
- **Response data**: Additional fields for tracking teams/matches created
- **Logging**: Enhanced logging to distinguish guest vs user bookings
- **Performance**: Faster confirmation for guest bookings (skip teams/matches)

### Backwards Compatibility
- ✅ **Existing user bookings**: Work exactly as before
- ✅ **Frontend code**: No changes needed for user booking flows
- ✅ **API responses**: Same structure with additional optional fields

## Testing

### Test Cases

1. **User Booking Confirmation**
   - Should create teams and matches
   - Should update booking status 
   - Should create payment record
   - Should return matches_created > 0

2. **Guest Booking Confirmation** 
   - Should skip teams and matches creation
   - Should update booking status
   - Should create payment record  
   - Should return matches_created = 0

3. **Recurring Booking Confirmation**
   - Should handle multiple slots correctly
   - Should create appropriate number of teams/matches (user) or skip (guest)

4. **Error Handling**
   - Invalid booking_id
   - Already confirmed booking
   - Missing authentication

```typescript
// Test Examples
const testUserConfirmation = {
  booking_id: 'user-booking-uuid',
  user_id: 'confirming-user-uuid',
  payment_method: 'pay_at_club'
}

const testGuestConfirmation = {
  booking_id: 'guest-booking-uuid',  // booking with guest_id
  user_id: 'confirming-user-uuid',
  payment_method: 'cash'
}
```

## Migration Notes

### For Frontend Teams
- **No breaking changes**: Existing confirmation flows continue to work
- **Optional enhancement**: Check response data to handle guest vs user bookings differently in UI
- **Performance**: Guest booking confirmations are faster (less processing)

### For Backend/Database  
- **Database constraints**: Ensure mutual exclusivity between user_id and guest_id
- **Service dependencies**: TeamService and MatchService are conditionally called
- **Monitoring**: Track confirmation success rates for both booking types