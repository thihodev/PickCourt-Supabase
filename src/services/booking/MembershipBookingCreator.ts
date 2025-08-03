import { BookingCreator } from './BookingFactory';
import { CreateBookingData } from '../BookingService';
import { CreateBookedSlot } from '../../types';
import { supabase } from '../../config/database';

export class MembershipBookingCreator implements BookingCreator {
  async create(data: CreateBookingData & { bookingId?: number }): Promise<void> {
    if (!data.bookingId) {
      throw new Error('Booking ID is required for slot creation');
    }

    // For membership bookings, we might apply special pricing or validation
    // For now, we'll create a single slot with membership-specific logic
    const duration = this.calculateDuration(data.start_time, data.end_time);
    
    const slotData: CreateBookedSlot = {
      booking_id: data.bookingId,
      court_id: data.court_id,
      slot_date: data.booking_date.toISOString().split('T')[0],
      start_time: data.start_time,
      end_time: data.end_time,
      duration_minutes: duration,
      price: 0, // Price will be calculated with membership discount
      status: 'scheduled',
    };

    const { error } = await supabase
      .from('booked_slots')
      .insert(slotData);

    if (error) {
      throw new Error(error.message);
    }
  }

  private calculateMembershipPrice(basePrice: number): number {
    // Apply membership discount (e.g., 20% off)
    return basePrice * 0.8;
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  }
}