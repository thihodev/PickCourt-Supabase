# PC Create Booking Edge Function

## Overview
Edge function để tạo booking cho court tennis/badminton. Hỗ trợ cả single booking (1 lần) và recurring booking (lặp lại theo lịch).

**URL:** `/functions/v1/pc-create-booking`  
**Method:** `POST`  
**Auth:** Required (Bearer token)

## Request Format

### Headers
```
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json
```

### Request Body

#### Single Booking
```json
{
  "court_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001", 
  "start_time": "2024-01-15T10:00:00Z",
  "end_time": "2024-01-15T12:00:00Z",
  "booking_type": "single", // Optional, defaults to "single"
  "notes": "Birthday party booking",
  "customer_info": {
    "name": "John Doe",
    "phone": "+84901234567",
    "email": "john@example.com"
  }
}
```

#### Recurring Booking
```json
{
  "court_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "start_time": "2024-01-15T10:00:00Z", // First occurrence
  "end_time": "2024-01-15T12:00:00Z",   // Duration for each occurrence
  "booking_type": "recurring",
  "recurring_config": {
    "frequency": "weekly",        // "daily" | "weekly" | "monthly"
    "interval": 1,               // Every 1 week
    "days_of_week": [1, 3, 5],   // Monday, Wednesday, Friday (0=Sunday, 1=Monday, ...)
    "occurrences": 8,            // Total 8 bookings
    "end_date": "2024-03-15T00:00:00Z" // Alternative to occurrences
  },
  "notes": "Regular training sessions",
  "customer_info": {
    "name": "Tennis Club",
    "phone": "+84901234567"
  }
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `court_id` | string (UUID) | ✅ | ID của court muốn book |
| `user_id` | string (UUID) | ✅ | ID của user tạo booking |
| `start_time` | string (ISO) | ✅ | Thời gian bắt đầu |
| `end_time` | string (ISO) | ✅ | Thời gian kết thúc |
| `booking_type` | string | ❌ | "single" hoặc "recurring" (default: "single") |
| `recurring_config` | object | ❌* | Config cho recurring booking (*required nếu booking_type="recurring") |
| `notes` | string | ❌ | Ghi chú cho booking |
| `customer_info` | object | ❌ | Thông tin khách hàng |

### Recurring Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `frequency` | string | ✅ | "daily", "weekly", "monthly" |
| `interval` | number | ✅ | Khoảng cách giữa các lần (vd: 1 = mỗi tuần, 2 = 2 tuần 1 lần) |
| `days_of_week` | number[] | ✅* | Mảng các ngày trong tuần, có thể nhiều ngày (*required nếu frequency="weekly") |
| `occurrences` | number | ❌ | Số lần lặp lại (alternative với end_date) |
| `end_date` | string (ISO) | ❌ | Ngày kết thúc (alternative với occurrences) |

### Days of Week Values
```
0 = Sunday (Chủ nhật)
1 = Monday (Thứ 2)
2 = Tuesday (Thứ 3)
3 = Wednesday (Thứ 4)
4 = Thursday (Thứ 5)
5 = Friday (Thứ 6)
6 = Saturday (Thứ 7)
```

**Examples:**
- `[1, 3, 5]` = Monday, Wednesday, Friday (3 ngày/tuần)
- `[1, 2, 3, 4, 5]` = Weekdays (5 ngày/tuần)
- `[6, 0]` = Weekend (2 ngày/tuần)
- `[2]` = Only Tuesday (1 ngày/tuần)

## Response Format

### Success Response (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "club_id": "550e8400-e29b-41d4-a716-446655440003",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T12:00:00Z",
    "status": "pending",
    "booking_type": "recurring",
    "total_amount": 800000,
    "recurring_config": {
      "frequency": "weekly",
      "interval": 1,
      "days_of_week": [1, 3, 5],
      "occurrences": 8
    },
    "metadata": {
      "notes": "Regular training sessions",
      "customer_info": {
        "name": "Tennis Club",
        "phone": "+84901234567"
      },
      "court_id": "550e8400-e29b-41d4-a716-446655440000",
      "court_name": "Court 1",
      "club_name": "ABC Tennis Club",
      "slots_count": 8,
      "created_by": "550e8400-e29b-41d4-a716-446655440001"
    },
    "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-10T08:00:00Z",
    "court": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Court 1",
      "club": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "ABC Tennis Club",
        "timezone": "Asia/Ho_Chi_Minh"
      }
    },
    "slots_info": {
      "count": 8,
      "total_amount": 800000,
      "booking_type": "recurring"
    }
  }
}
```

### Error Responses

#### 400 Bad Request - Missing Fields
```json
{
  "success": false,
  "error": "Missing required fields: court_id, user_id, start_time, end_time"
}
```

#### 400 Bad Request - Invalid Recurring Config
```json
{
  "success": false,
  "error": "recurring_config is required for recurring bookings"
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

#### 409 Conflict - Time Slot Conflict
```json
{
  "success": false,
  "error": "Conflicts found for 2 slots. First conflict: 2024-01-17T10:00:00Z"
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

### Workflow
1. **Validation**: Validate required fields và recurring config
2. **Authentication**: Verify JWT token
3. **Court Validation**: Check court exists và operating hours
4. **Slot Generation**: 
   - Single: 1 slot
   - Recurring: Generate multiple slots theo pattern
5. **Conflict Check**: Kiểm tra tất cả slots có conflict không
6. **Pricing**: Calculate total amount cho tất cả slots
7. **Database Operations**:
   - Tạo 1 booking record
   - Tạo multiple booked_slots (mỗi slot = 1 ngày)
8. **Cache**: Add reserved slots vào cache (10 phút expiry)

### Booking vs Booked Slots
- **1 Booking** = 1 transaction/order từ user
- **Multiple Booked Slots** = các time slots thực tế trên lịch

**Ví dụ**: Recurring booking 8 tuần
- 1 booking record với `booking_type: "recurring"`
- 8 booked_slots records (mỗi tuần 1 slot)

### Pricing Logic
- Mỗi slot được tính giá riêng theo time và day of week
- Total amount = tổng giá tất cả slots
- Hỗ trợ giá khác nhau cho từng time slot

### Cache & Expiry
- Tất cả slots được add vào cache với 10 phút expiry
- User có 10 phút để confirm payment
- Sau 10 phút, slots tự động expired và available lại

## Frontend Integration Examples

### React/TypeScript Example

```typescript
interface CreateBookingRequest {
  court_id: string
  user_id: string
  start_time: string
  end_time: string
  booking_type?: 'single' | 'recurring'
  recurring_config?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number
    days_of_week?: number[]
    occurrences?: number
    end_date?: string
  }
  notes?: string
  customer_info?: {
    name?: string
    phone?: string
    email?: string
  }
}

async function createBooking(data: CreateBookingRequest) {
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

// Usage - Single booking
const singleBooking = await createBooking({
  court_id: 'court-uuid',
  user_id: 'user-uuid',
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T12:00:00Z',
  notes: 'Birthday party'
})

// Usage - Weekly recurring (multiple days)
const recurringBooking = await createBooking({
  court_id: 'court-uuid',
  user_id: 'user-uuid', 
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T12:00:00Z',
  booking_type: 'recurring',
  recurring_config: {
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1, 3, 5], // Mon, Wed, Fri (3 days per week)
    occurrences: 8 // Total 24 slots (8 weeks × 3 days)
  }
})

// Usage - Weekdays only
const weekdaysBooking = await createBooking({
  court_id: 'court-uuid',
  user_id: 'user-uuid',
  start_time: '2024-01-15T10:00:00Z', 
  end_time: '2024-01-15T12:00:00Z',
  booking_type: 'recurring',
  recurring_config: {
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1, 2, 3, 4, 5], // Monday to Friday
    occurrences: 4 // Total 20 slots (4 weeks × 5 days)
  }
})
```

### JavaScript/Fetch Example

```javascript
// Weekly recurring booking example
const bookingData = {
  court_id: 'your-court-uuid',
  user_id: 'your-user-uuid',
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T12:00:00Z',
  booking_type: 'recurring',
  recurring_config: {
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1, 3, 5], // Monday, Wednesday, Friday
    occurrences: 8 // 8 weeks
  },
  notes: 'Tennis training sessions'
}

fetch('/functions/v1/pc-create-booking', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(bookingData)
})
.then(response => response.json())
.then(data => {
  console.log('Booking created:', data)
  // Handle successful booking
})
.catch(error => {
  console.error('Booking failed:', error)
  // Handle error
})
```

## Common Use Cases

### 1. Single Court Booking
Đặt court 1 lần cho event hoặc casual play.

### 2. Weekly Training Sessions (Multiple Days)
Đặt court cố định mỗi tuần cho training club, có thể nhiều ngày:
- **Mon/Wed/Fri**: `days_of_week: [1, 3, 5]` 
- **Weekdays**: `days_of_week: [1, 2, 3, 4, 5]`
- **Weekend**: `days_of_week: [6, 0]`

### 3. Daily Tournament Prep
Đặt court hằng ngày trong 1 tháng để chuẩn bị tournament.

### 4. Monthly Club Meetings
Đặt court tháng 1 lần cho club meeting.

### 5. Intensive Training Programs
Đặt court nhiều ngày trong tuần cho intensive training:
- **4 days/week**: `days_of_week: [1, 2, 4, 5]` (Mon, Tue, Thu, Fri)
- **Every other day**: `days_of_week: [1, 3, 5, 0]` (Mon, Wed, Fri, Sun)

## Notes & Limitations

1. **Max Occurrences**: Mặc định giới hạn 50 occurrences cho recurring
2. **Conflict Resolution**: Nếu 1 slot conflict, cả booking sẽ fail
3. **Payment Window**: 10 phút để complete payment
4. **Timezone**: Sử dụng club timezone, default "Asia/Ho_Chi_Minh"
5. **Cache Dependencies**: Cần Upstash Redis để cache slots
6. **Database Transaction**: Tất cả operations trong 1 transaction

## Testing

### Test Cases để FE cần test:

1. **Single booking** - basic case
2. **Weekly recurring** - với days_of_week
3. **Daily recurring** - với interval > 1  
4. **Monthly recurring** - với end_date
5. **Conflict scenarios** - booking slot đã có người
6. **Invalid auth** - token expired/invalid
7. **Missing fields** - thiếu required fields
8. **Invalid recurring config** - sai format config

### Example Test Data

```javascript
// Test 1: Single booking
const testSingle = {
  court_id: 'test-court-uuid',
  user_id: 'test-user-uuid',
  start_time: '2024-02-01T10:00:00Z',
  end_time: '2024-02-01T12:00:00Z'
}

// Test 2: Weekly recurring
const testWeekly = {
  court_id: 'test-court-uuid',
  user_id: 'test-user-uuid',
  start_time: '2024-02-01T10:00:00Z',
  end_time: '2024-02-01T12:00:00Z',
  booking_type: 'recurring',
  recurring_config: {
    frequency: 'weekly',
    interval: 1,
    days_of_week: [1, 3, 5],
    occurrences: 4
  }
}
```