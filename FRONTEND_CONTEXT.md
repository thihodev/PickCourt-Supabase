# PickCourt API - Frontend Integration Context

## Tổng quan hệ thống
PickCourt là hệ thống đặt sân cầu lông (badminton) multi-tenant được xây dựng trên nền tảng Supabase Edge Functions với TypeScript.

## Công nghệ Backend
- **Runtime**: Deno (Edge Functions)
- **Language**: TypeScript
- **Backend**: Supabase Edge Functions
- **Database**: PostgreSQL với Supabase
- **Authentication**: Supabase Auth (JWT tokens)
- **Real-time**: Supabase Realtime subscriptions

## Cấu trúc thư mục chính

```
PickCourt-Supabase/
├── src/                          # Shared types và services
│   ├── types/
│   │   ├── database.types.ts     # Database schema types
│   │   ├── models.ts             # Business models
│   │   └── index.ts              # Type exports
│   └── services/                 # Business logic services
│       ├── AuthService.ts
│       ├── BookingService.ts
│       ├── booking-factory.ts
│       ├── pricing.ts
│       └── booking/             # Factory pattern implementations
│           ├── BookingFactory.ts
│           ├── MembershipBookingCreator.ts
│           ├── RecurringBookingCreator.ts
│           └── SingleBookingCreator.ts
├── supabase/
│   ├── functions/               # API Endpoints (Edge Functions)
│   │   ├── auth/               # Authentication endpoints
│   │   ├── bookings/           # Booking management
│   │   ├── courts/             # Court management
│   │   └── _shared/            # Shared utilities
│   ├── migrations/             # Database schema
│   └── config.toml            # Supabase configuration
└── package.json
```

## Database Schema - Core Tables

### 1. **tenants** - Multi-tenant organizations
```typescript
{
  id: UUID
  name: string
  slug: string (unique)
  domain?: string
  settings: JSON
  created_at: timestamp
  updated_at: timestamp
}
```

### 2. **users** - Extends Supabase auth.users
```typescript
{
  id: UUID (references auth.users)
  tenant_id: UUID
  email: string
  role: 'admin' | 'staff' | 'customer'
  profile: JSON
  created_at: timestamp
  updated_at: timestamp
}
```

### 3. **courts** - Badminton courts
```typescript
{
  id: UUID
  tenant_id: UUID
  name: string
  type: string (default: 'badminton')
  status: 'active' | 'maintenance' | 'inactive'
  settings: JSON
  created_at: timestamp
  updated_at: timestamp
}
```

### 4. **bookings** - Main booking records
```typescript
{
  id: UUID
  tenant_id: UUID
  court_id: UUID
  user_id: UUID
  start_time: timestamp
  end_time: timestamp
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  booking_type: 'single' | 'recurring' | 'membership'
  total_amount: decimal
  metadata: JSON (recurring patterns, etc.)
  created_at: timestamp
  updated_at: timestamp
}
```

### 5. **court_prices** - Time-based pricing
```typescript
{
  id: UUID
  court_id: UUID
  day_of_week: number (0=Sunday, 6=Saturday)
  start_time: time
  end_time: time
  price: decimal
  is_active: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

### 6. **payments** - Payment tracking
```typescript
{
  id: UUID
  tenant_id: UUID
  booking_id: UUID
  amount: decimal
  payment_method: string
  transaction_id?: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  metadata: JSON
  paid_at?: timestamp
  created_at: timestamp
  updated_at: timestamp
}
```

## API Endpoints chính

### Authentication (/auth)
- `POST /auth/login` - Đăng nhập
- `POST /auth/register` - Đăng ký
- `POST /auth/logout` - Đăng xuất
- `POST /auth/refresh` - Refresh token
- `GET /auth/me` - Lấy thông tin user
- `PUT /auth/profile` - Cập nhật profile

### Courts (/courts)
- `GET /courts` - Danh sách sân (có filter)
- `POST /courts` - Tạo sân mới
- `GET /courts/:id` - Chi tiết sân
- `PUT /courts/:id` - Cập nhật sân
- `DELETE /courts/:id` - Xóa sân

### Bookings (/bookings)
- `GET /bookings` - Danh sách booking (có filter)
- `POST /bookings` - Tạo booking mới
- `GET /bookings/:id` - Chi tiết booking
- `PUT /bookings/:id` - Cập nhật booking
- `DELETE /bookings/:id` - Hủy booking

## Features chính

### 1. Multi-tenant Support
- Mỗi tenant có domain/slug riêng
- Cô lập dữ liệu hoàn toàn giữa các tenant
- Hỗ trợ multiple users per tenant với roles

### 2. Advanced Booking System
- **Single bookings**: Đặt 1 lần
- **Recurring bookings**: Đặt lặp lại (daily/weekly/monthly)
- **Membership bookings**: Cho thành viên
- Ngăn chặn booking trùng lặp với PostgreSQL EXCLUDE constraint

### 3. Dynamic Pricing
- Giá theo thời gian trong ngày
- Giá theo ngày trong tuần
- Flexible pricing rules per court

### 4. Authentication & Authorization
- Supabase Auth với JWT tokens
- Multi-role support (admin/staff/customer)
- Tenant-scoped authentication

## Environment & Configuration

### Local Development
```bash
npm run dev          # Start Supabase locally
npm run functions:serve  # Serve functions
npm run typecheck    # TypeScript checking
npm run lint         # Linting
npm run test         # Testing
```

### Supabase Configuration
- **API Port**: 54321
- **DB Port**: 54322
- **Studio Port**: 54323
- **Storage**: 50MiB file limit
- **JWT Expiry**: 3600s (1 hour)

## Frontend Integration Points

### 1. Supabase Client Setup
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'http://localhost:54321',  // Local development
  'your-anon-key'
)
```

### 2. Authentication Flow
```javascript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Get current user
const { data: { user } } = await supabase.auth.getUser()
```

### 3. Real-time Subscriptions
```javascript
// Listen for booking changes
const subscription = supabase
  .channel('bookings')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'bookings'
  }, (payload) => {
    console.log('Booking changed:', payload)
  })
  .subscribe()
```

### 4. API Calls to Edge Functions
```javascript
// Call booking function
const { data, error } = await supabase.functions.invoke('bookings', {
  body: { 
    court_id: 'uuid',
    start_time: '2024-01-01T10:00:00Z',
    end_time: '2024-01-01T11:00:00Z'
  }
})
```

## Key Business Logic Services

### BookingService
- Xử lý logic đặt sân
- Kiểm tra availability
- Tính toán pricing
- Tạo recurring bookings

### AuthService  
- Multi-tenant authentication
- Role-based access control
- JWT token management

### PricingService
- Dynamic pricing calculation
- Time-based rates
- Special pricing rules

## Migration Notes

**Đã simplify từ hệ thống phức tạp hơn:**
- Loại bỏ facilities table (chỉ focus badminton)
- Loại bỏ locations table (single venue)
- Đơn giản hóa pricing rules
- Tập trung vào core booking functionality

## Development Commands

```bash
# Start development
npm run dev

# Database operations
npm run reset                # Reset database
npm run migration:new        # Create new migration
npm run migration:up         # Apply migrations

# Function operations
npm run functions:serve      # Serve functions locally
npm run functions:deploy     # Deploy functions

# Quality checks
npm run typecheck           # TypeScript checking
npm run lint               # Code linting  
npm run test               # Run tests
```

## Recommended Frontend Tech Stack

**Với context này, frontend nên sử dụng:**
- **React/Next.js** hoặc **Vue.js/Nuxt.js**
- **Supabase JavaScript Client** 
- **TypeScript** (types đã có sẵn)
- **Tailwind CSS** cho styling
- **React Query/SWR** cho data fetching
- **Real-time subscriptions** cho live updates

Tệp này cung cấp đầy đủ context để team frontend có thể integrate nhanh chóng và chính xác với backend API.