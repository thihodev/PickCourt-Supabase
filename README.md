# PickCourt API - Supabase Edition

A court booking API built with Supabase Edge Functions and TypeScript.

## Features

- **Multi-tenant Architecture** - Support for multiple businesses/organizations
- **Court Management** - Courts with dynamic pricing
- **Advanced Booking System** - Single, recurring, and membership bookings
- **Product Sales** - Sell products/items alongside bookings
- **Payment Processing** - Comprehensive payment tracking
- **Authentication** - Supabase Auth with JWT tokens
- **Edge Functions** - Serverless functions for API endpoints
- **Type Safety** - Full TypeScript coverage
- **Real-time** - Real-time subscriptions with Supabase

## Tech Stack

- **Runtime**: Deno (Edge Functions)
- **Language**: TypeScript
- **Backend**: Supabase Edge Functions
- **Database**: PostgreSQL with Supabase
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **Storage**: Supabase Storage

## Installation

1. **Clone and navigate to the project**:
   ```bash
   cd /Users/thiho/Projects/Persional/PickCourt/PickCourtAPI-NodeJS
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database and other configurations.

4. **Set up MySQL database**:
   ```sql
   CREATE DATABASE pickcourt;
   CREATE USER 'pickcourt_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON pickcourt.* TO 'pickcourt_user'@'localhost';
   ```

5. **Run database migrations** (TypeORM will auto-sync in development):
   ```bash
   npm run dev
   ```

## Development

Start the development server with hot reload:
```bash
npm run dev
```

The API will be available at:
- Manager API: `http://localhost:3000/api/v1`
- Client API: `http://localhost:3000/api/client/v1`
- Health check: `http://localhost:3000/health`

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/user` - Get current user
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password

### Bookings (Manager API)
- `GET /api/v1/bookings` - List bookings with filters
- `POST /api/v1/bookings` - Create new booking
- `GET /api/v1/bookings/:id` - Get booking details
- `PATCH /api/v1/bookings/:id/status` - Update booking status
- `DELETE /api/v1/bookings/:id` - Cancel booking
- `GET /api/v1/bookings/statistics` - Get booking statistics
- `GET /api/v1/bookings/available-courts` - Find available courts

### Client API
- `POST /api/client/v1/register` - Client registration
- `POST /api/client/v1/login` - Client login
- `GET /api/client/v1/courts` - Browse courts (public)
- `GET /api/client/v1/facilities` - Browse facilities (public)
- `POST /api/client/v1/bookings` - Create booking (authenticated)

## Database Schema

### Core Entities
- **users** - User accounts
- **tenants** - Multi-tenant organizations
- **tenant_users** - User-tenant relationships
- **locations** - Physical venues
- **facilities** - Sport types (tennis, basketball, etc.)
- **courts** - Individual playing areas
- **price_rules** - Dynamic pricing based on time/day

### Booking System
- **bookings** - Master booking records
- **booked_slots** - Individual time slots (supports recurring)
- **products** - Retail items for sale
- **booking_products** - Products sold per booking
- **payments** - Payment transactions
- **unavailable_times** - Court maintenance/blocked times

## Key Features Implemented

### 1. Multi-Tenant Support
- Tenants can have multiple locations
- Users can belong to multiple tenants
- Data isolation per tenant

### 2. Advanced Booking System
- Single bookings
- Recurring bookings (daily/weekly/monthly)
- Membership bookings
- Product sales integration
- Dynamic pricing rules

### 3. Authentication & Authorization
- JWT access and refresh tokens
- Password reset via email
- Tenant-based access control
- Role-based permissions ready

### 4. Type Safety
- Full TypeScript coverage
- TypeORM entities with relationships
- Request/response validation with Joi
- Comprehensive error handling

## Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Production Build

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## Environment Variables

Key environment variables to configure:

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pickcourt
DB_USER=your_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key
JWT_REFRESH_SECRET=your_refresh_secret

# Email
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your_email
MAIL_PASSWORD=your_password
```

## Migration Status

✅ **Completed Features**:
- User authentication and management
- Multi-tenant architecture
- Court and location management
- Advanced booking system with recurring support
- Product sales integration
- Payment tracking
- TypeORM models with relationships
- Comprehensive validation
- JWT authentication with refresh tokens
- Email notifications
- Error handling and logging
- Unit tests and test framework

🚧 **Ready for Extension**:
- Additional controller implementations
- Advanced reporting features
- File upload handling
- Real-time notifications
- Payment gateway integrations

## API Documentation

The API follows RESTful conventions and includes:
- Standardized error responses
- Request/response validation
- Comprehensive logging
- Rate limiting
- CORS configuration
- Security middleware (Helmet)

All API endpoints return JSON responses with consistent structure:
```json
{
  "data": {},
  "message": "Success message",
  "meta": {}
}
```

Error responses:
```json
{
  "error": "Error message",
  "timestamp": "2025-01-21T10:30:00.000Z"
}
```

## License

MIT License