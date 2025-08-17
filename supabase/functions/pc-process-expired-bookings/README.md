# Process Expired Bookings Function

## Overview

This Edge Function automatically processes expired bookings by finding `booked_slots` with `status = 'scheduled'` and `expiry_at < now()`, then updates them and their related bookings to `expired` status.

## Features

- **Automated Processing**: Runs every 10 minutes via cron schedule
- **Comprehensive Updates**: Updates both `booked_slots` and `bookings` tables
- **Cache Cleanup**: Removes expired slots from Upstash cache
- **Detailed Logging**: Provides comprehensive logs and statistics
- **Error Handling**: Graceful error handling with detailed error messages
- **Statistics Tracking**: Returns detailed processing results

## Scheduling

The function is scheduled to run every 10 minutes using the cron configuration:

```yaml
schedule: "*/10 * * * *"  # Every 10 minutes
timezone: "Asia/Ho_Chi_Minh"
```

## Function Logic

1. **Find Expired Slots**: Query `booked_slots` where:
   - `status = 'scheduled'`
   - `expiry_at IS NOT NULL`
   - `expiry_at < NOW()`

2. **Update Slots**: Set `status = 'expired'` for found slots

3. **Update Bookings**: Set `status = 'expired'` for related bookings that are still `pending`

4. **Cache Cleanup**: Remove expired slots from Upstash Redis cache

5. **Return Results**: Detailed processing statistics and any errors

## Response Format

```json
{
  "message": "Expired bookings processed successfully",
  "expired_slots_count": 5,
  "expired_bookings_count": 3,
  "processed_booking_ids": ["uuid1", "uuid2", "uuid3"],
  "errors": [],
  "processed_at": "2024-01-15T10:30:00.000Z",
  "processing_time_ms": 450,
  "success": true
}
```

## Manual Execution

You can manually trigger the function for testing:

```bash
# Using curl
curl -X POST https://your-project.supabase.co/functions/v1/process-expired-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scheduled": false, "trigger": "manual"}'
```

## Monitoring

The function provides detailed console logs for monitoring:

- `🕐` Start time
- `📋` Processing counts
- `✅` Success messages
- `⚠️` Warnings
- `❌` Errors
- `💥` Critical failures

## Related Services

- **ExpiredBookingService**: Core service handling the business logic

## Error Handling

The function handles various error scenarios:

- Database connection issues
- Query execution errors
- Cache cleanup failures
- Service initialization problems

Non-critical errors (like cache cleanup failures) don't stop the main processing flow.

## Database Changes

The function modifies these tables:

### booked_slots
- Sets `status = 'expired'`
- Updates `updated_at` timestamp

### bookings  
- Sets `status = 'expired'` (only for `pending` bookings)
- Updates `updated_at` timestamp
- Adds metadata:
  ```json
  {
    "expired_at": "2024-01-15T10:30:00.000Z",
    "expired_reason": "payment_timeout",
    "original_expiry_slots": 5
  }
  ```

## Performance Considerations

- Uses efficient database queries with proper indexing
- Batch updates for better performance
- Non-blocking cache operations
- Processes only necessary records (pending bookings)

## Security

- Uses Supabase Admin Client for database access
- No user authentication required (scheduled function)
- Proper error handling to prevent information leakage