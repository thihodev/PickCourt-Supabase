import type { Database, BookingRequest, RecurringBookingRequest, PricingCalculation } from '../types/index.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PricingService } from './pricing.ts';
import { BookingFactory } from './booking-factory.ts';

export class BookingService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private tenantId: string,
    private pricingService: PricingService
  ) {}

  async createBooking(request: BookingRequest, userId: string) {
    const bookingCreator = BookingFactory.create(request.bookingType);
    
    const pricing = await this.pricingService.calculatePrice({
      courtId: request.courtId,
      startTime: new Date(request.startTime),
      endTime: new Date(request.endTime),
      bookingType: request.bookingType,
      userId
    });

    return await bookingCreator.create({
      ...request,
      userId,
      tenantId: this.tenantId,
      totalAmount: pricing.totalPrice,
      metadata: {
        ...request.metadata,
        pricingCalculation: pricing
      }
    }, this.supabase);
  }

  async createRecurringBooking(request: RecurringBookingRequest, userId: string) {
    const bookingCreator = BookingFactory.create('recurring');
    
    return await bookingCreator.create({
      ...request,
      userId,
      tenantId: this.tenantId,
      totalAmount: 0 // Will be calculated per booking
    }, this.supabase);
  }

  async getBookings(filters: {
    courtId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) {
    let query = this.supabase
      .from('bookings')
      .select(`
        *,
        court:courts(*),
        user:users(*)
      `)
      .eq('tenant_id', this.tenantId);

    if (filters.courtId) {
      query = query.eq('court_id', filters.courtId);
    }

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters.startDate) {
      query = query.gte('start_time', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('end_time', filters.endDate);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    return await query.order('start_time', { ascending: true });
  }

  async getBooking(id: string) {
    return await this.supabase
      .from('bookings')
      .select(`
        *,
        court:courts(*),
        user:users(*)
      `)
      .eq('id', id)
      .eq('tenant_id', this.tenantId)
      .single();
  }

  async updateBooking(id: string, updates: Partial<BookingRequest>) {
    const { data: existingBooking } = await this.getBooking(id);
    if (!existingBooking) {
      throw new Error('Booking not found');
    }

    let totalAmount = existingBooking.total_amount;

    if (updates.startTime || updates.endTime || updates.courtId) {
      const pricing = await this.pricingService.calculatePrice({
        courtId: updates.courtId || existingBooking.court_id,
        startTime: new Date(updates.startTime || existingBooking.start_time),
        endTime: new Date(updates.endTime || existingBooking.end_time),
        bookingType: existingBooking.booking_type,
        userId: existingBooking.user_id
      });
      totalAmount = pricing.totalPrice;
    }

    return await this.supabase
      .from('bookings')
      .update({
        ...updates,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', this.tenantId)
      .select()
      .single();
  }

  async cancelBooking(id: string) {
    return await this.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', this.tenantId)
      .select()
      .single();
  }

  async checkAvailability(courtId: string, startTime: string, endTime: string, excludeBookingId?: string) {
    let query = this.supabase
      .from('bookings')
      .select('id')
      .eq('court_id', courtId)
      .eq('tenant_id', this.tenantId)
      .neq('status', 'cancelled')
      .or(`start_time.lt.${endTime},end_time.gt.${startTime}`);

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId);
    }

    const { data, error } = await query;
    
    if (error) {
      throw error;
    }

    return data.length === 0;
  }
}