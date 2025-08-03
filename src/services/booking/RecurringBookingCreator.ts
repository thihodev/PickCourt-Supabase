import { BookingCreator } from './BookingFactory';
import { CreateBookingData } from '../BookingService';
import { CreateBookedSlot, RecurrencePattern } from '../../types';
import { supabase } from '../../config/database';

export class RecurringBookingCreator implements BookingCreator {
  async create(data: CreateBookingData & { bookingId?: number }): Promise<void> {
    if (!data.bookingId) {
      throw new Error('Booking ID is required for slot creation');
    }

    const slots = this.generateRecurringSlots(data, data.bookingId);
    
    if (slots.length > 0) {
      const { error } = await supabase
        .from('booked_slots')
        .insert(slots);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  private generateRecurringSlots(data: CreateBookingData, bookingId: number): CreateBookedSlot[] {
    const slots: CreateBookedSlot[] = [];
    const duration = this.calculateDuration(data.start_time, data.end_time);
    const pricePerSlot = 0; // Price will be calculated later

    if (!data.start_date || !data.end_date) {
      throw new Error('Start and end dates are required for recurring bookings');
    }

    let currentDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    const maxSessions = data.total_sessions || 10;
    let sessionCount = 0;

    while (currentDate <= endDate && sessionCount < maxSessions) {
      if (this.shouldCreateSlotForDate(currentDate, data)) {
        slots.push({
          booking_id: bookingId,
          court_id: data.court_id,
          slot_date: currentDate.toISOString().split('T')[0],
          start_time: data.start_time,
          end_time: data.end_time,
          duration_minutes: duration,
          price: pricePerSlot,
          status: 'scheduled',
        });
        sessionCount++;
      }

      currentDate = this.getNextDate(currentDate, data.recurrence_pattern || RecurrencePattern.WEEKLY);
    }

    return slots;
  }

  private shouldCreateSlotForDate(date: Date, data: CreateBookingData): boolean {
    if (!data.days_of_week || data.days_of_week.length === 0) {
      return true;
    }
    return data.days_of_week.includes(date.getDay());
  }

  private getNextDate(currentDate: Date, pattern: RecurrencePattern): Date {
    const nextDate = new Date(currentDate);
    
    switch (pattern) {
      case RecurrencePattern.DAILY:
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case RecurrencePattern.WEEKLY:
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case RecurrencePattern.BIWEEKLY:
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case RecurrencePattern.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }
    
    return nextDate;
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  }
}