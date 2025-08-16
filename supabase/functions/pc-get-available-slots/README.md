# Get Available Slots Edge Function

## Overview
This edge function retrieves available time slots for court bookings across clubs. It uses Redis cache for performance optimization by checking booked slots from Upstash instead of direct database queries.

## Endpoint
`GET /functions/v1/pc-get-available-slots`

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date_from` | string | No | Today | Start date in YYYY-MM-DD format |
| `date_to` | string | No | Today + 10 days | End date in YYYY-MM-DD format |
| `duration` | number | No | 60 | Slot duration in minutes (60, 90, or 120) |
| `limit` | number | No | 50 | Maximum number of results (1-100) |
| `offset` | number | No | 0 | Number of results to skip |
| `club_ids` | string | No | First 5 clubs | Comma-separated club IDs |

## Example Requests

### Basic Request (Default Parameters)
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/pc-get-available-slots" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### With Date Range
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/pc-get-available-slots?date_from=2024-01-15&date_to=2024-01-20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### With Duration Filter
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/pc-get-available-slots?duration=90" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### With Specific Clubs
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/pc-get-available-slots?club_ids=club1,club2,club3" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### With Pagination
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/pc-get-available-slots?limit=20&offset=40" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Response Format

```json
{
  "slots": [
    {
      "clubId": "uuid",
      "clubName": "Premium Club",
      "courtId": "uuid", 
      "courtName": "Court 1",
      "date": "2024-01-15",
      "timeSlots": [
        {
          "startTime": "2024-01-15T08:00:00.000Z",
          "endTime": "2024-01-15T09:00:00.000Z",
          "price": 100000
        },
        {
          "startTime": "2024-01-15T09:00:00.000Z", 
          "endTime": "2024-01-15T10:00:00.000Z",
          "price": 120000
        }
      ]
    }
  ],
  "total": 150,
  "hasMore": true,
  "filters": {
    "date_from": "2024-01-15",
    "date_to": "2024-01-25", 
    "duration": 60,
    "limit": 50,
    "offset": 0,
    "club_ids": null
  },
  "meta": {
    "generated_at": "2024-01-15T10:30:00.000Z",
    "total_slots": 150,
    "has_more": true
  }
}
```

## Features

### Performance Optimization
- Uses Upstash Redis cache for booked slots validation
- Avoids heavy database queries for conflict checking
- Efficient time slot generation algorithm

### Smart Filtering
- Automatically excludes past time slots
- Respects club operating hours
- Handles different timezones correctly
- Supports multiple duration options

### Price Calculation
- Dynamic pricing based on court_prices table
- Handles overlapping price segments
- Accounts for day of week pricing

### Constraints
- Maximum 30 days date range
- Maximum 100 results per request
- Limited to 5 clubs by default (if no club_ids specified)
- Only returns slots for active clubs and courts

## Error Responses

### 400 Bad Request
```json
{
  "error": "Duration must be 60, 90, or 120 minutes"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Dependencies
- AvailableSlotsService
- UpstashBookedSlotService  
- Supabase client
- Moment.js for timezone handling

## Database Tables Used
- `clubs` - Club information and operating hours
- `courts` - Court details and status
- `court_prices` - Pricing rules by day of week and time
- Upstash Redis cache for booked slots

## Notes
- All times are returned in ISO 8601 format with timezone info
- Prices are in the smallest currency unit (e.g., cents for USD, đồng for VND)
- The function automatically handles timezone conversions based on club settings
- Past dates and times are automatically filtered out