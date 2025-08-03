import type { Database, BookingRequest, RecurringBookingRequest } from '../types/index.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface BookingCreator {
  create(request: any, supabase: SupabaseClient<Database>): Promise<any>;
}

export class SingleBookingCreator implements BookingCreator {
  async create(request: BookingRequest & { userId: string; tenantId: string; totalAmount: number }, supabase: SupabaseClient<Database>) {
    return await supabase
      .from('bookings')
      .insert({
        tenant_id: request.tenantId,
        court_id: request.courtId,
        user_id: request.userId,
        start_time: request.startTime,
        end_time: request.endTime,
        booking_type: 'single',
        status: 'pending',
        total_amount: request.totalAmount,
        metadata: request.metadata
      })
      .select()
      .single();
  }
}

export class RecurringBookingCreator implements BookingCreator {
  async create(request: RecurringBookingRequest & { userId: string; tenantId: string; totalAmount: number }, supabase: SupabaseClient<Database>) {
    const bookings = this.generateRecurringBookings(request);
    
    const results = [];
    for (const booking of bookings) {
      const result = await supabase
        .from('bookings')
        .insert({
          tenant_id: request.tenantId,
          court_id: request.courtId,
          user_id: request.userId,
          start_time: booking.startTime,
          end_time: booking.endTime,
          booking_type: 'recurring',
          status: 'pending',
          total_amount: booking.totalAmount,
          metadata: {
            ...request.metadata,
            recurrenceId: booking.recurrenceId,
            isRecurring: true
          }
        })
        .select()
        .single();
      
      results.push(result);
    }
    
    return { data: results };
  }

  private generateRecurringBookings(request: RecurringBookingRequest & { userId: string; tenantId: string }) {
    const bookings = [];
    const startDate = new Date(request.startTime);
    const endDate = new Date(request.recurrencePattern.endDate);
    const duration = new Date(request.endTime).getTime() - new Date(request.startTime).getTime();
    
    const recurrenceId = crypto.randomUUID();
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      if (this.shouldCreateBookingForDate(currentDate, request.recurrencePattern)) {
        const bookingStart = new Date(currentDate);
        const bookingEnd = new Date(bookingStart.getTime() + duration);
        
        bookings.push({
          startTime: bookingStart.toISOString(),
          endTime: bookingEnd.toISOString(),
          totalAmount: 0, // Will be calculated individually
          recurrenceId
        });
      }
      
      currentDate = this.getNextDate(currentDate, request.recurrencePattern);
    }
    
    return bookings;
  }

  private shouldCreateBookingForDate(date: Date, pattern: any): boolean {
    if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
      return pattern.daysOfWeek.includes(date.getDay());
    }
    return true;
  }

  private getNextDate(date: Date, pattern: any): Date {
    const next = new Date(date);
    
    switch (pattern.frequency) {
      case 'daily':
        next.setDate(next.getDate() + pattern.interval);
        break;
      case 'weekly':
        next.setDate(next.getDate() + (7 * pattern.interval));
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + pattern.interval);
        break;
    }
    
    return next;
  }
}

export class MembershipBookingCreator implements BookingCreator {
  async create(request: BookingRequest & { userId: string; tenantId: string; totalAmount: number }, supabase: SupabaseClient<Database>) {
    const membership = await this.getUserMembership(request.userId, request.tenantId, supabase);
    
    if (!membership) {
      throw new Error('User does not have an active membership');
    }

    return await supabase
      .from('bookings')
      .insert({
        tenant_id: request.tenantId,
        court_id: request.courtId,
        user_id: request.userId,
        start_time: request.startTime,
        end_time: request.endTime,
        booking_type: 'membership',
        status: 'confirmed',
        total_amount: request.totalAmount,
        metadata: {
          ...request.metadata,
          membershipId: membership.id,
          usesCredit: true
        }
      })
      .select()
      .single();
  }

  private async getUserMembership(userId: string, tenantId: string, supabase: SupabaseClient<Database>) {
    // This would typically check for an active membership
    // For now, we'll return a mock membership
    return {
      id: 'membership-1',
      type: 'premium',
      creditsRemaining: 10
    };
  }
}

export class BookingFactory {
  static create(type: 'single' | 'recurring' | 'membership'): BookingCreator {
    switch (type) {
      case 'single':
        return new SingleBookingCreator();
      case 'recurring':
        return new RecurringBookingCreator();
      case 'membership':
        return new MembershipBookingCreator();
      default:
        throw new Error(`Unknown booking type: ${type}`);
    }
  }
}