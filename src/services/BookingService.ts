import { BookingRepository, BookingFilters } from '../repositories/BookingRepository';
import { UserRepository } from '../repositories/UserRepository';
import { supabase } from '../config/database';
import { Booking, BookingWithRelations, BookingStatus, BookingType, RecurrencePattern, CreateBooking, Court, Product, CreateBookedSlot, BookedSlotStatus, CreateBookingProduct } from '../types';
import { NotFoundError, ValidationError, ConflictError } from '../middlewares/errorHandler';
import { PricingService, PricingStrategyType } from './pricing/PricingService';
import { BookingFactory } from './booking/BookingFactory';
import { SingleBookingCreator } from './booking/SingleBookingCreator';
import { RecurringBookingCreator } from './booking/RecurringBookingCreator';
import { MembershipBookingCreator } from './booking/MembershipBookingCreator';

export interface CreateBookingData {
  court_id: number;
  user_id?: number;
  tenant_id: number;
  booking_date: Date;
  start_time: string;
  end_time: string;
  notes?: string;
  booking_type?: BookingType;
  recurrence_pattern?: RecurrencePattern;
  days_of_week?: number[];
  start_date?: Date;
  end_date?: Date;
  total_sessions?: number;
  products?: Array<{
    product_id: number;
    quantity: number;
  }>;
}

export interface AvailableCourtFilters {
  tenant_id: number;
  date: Date;
  start_time: string;
  end_time: string;
  facility_id?: number;
}

export class BookingService {
  private bookingRepository: BookingRepository;
  private userRepository: UserRepository;
  private pricingService: PricingService;
  private bookingFactory: BookingFactory;

  constructor() {
    this.bookingRepository = new BookingRepository();
    this.userRepository = new UserRepository();
    this.pricingService = new PricingService();
    this.bookingFactory = new BookingFactory();
    
    // Register booking creators
    this.bookingFactory.registerCreator(BookingType.SINGLE, new SingleBookingCreator());
    this.bookingFactory.registerCreator(BookingType.RECURRING, new RecurringBookingCreator());
    this.bookingFactory.registerCreator(BookingType.MEMBERSHIP, new MembershipBookingCreator());
  }

  async createBooking(data: CreateBookingData, currentUserId?: number): Promise<Booking> {
    // Supabase transactions are handled differently, we'll use a try-catch block
      // Use current user if no user_id provided
      const userId = data.user_id || currentUserId;
      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      // Verify court exists and belongs to tenant
      const { data: court, error: courtError } = await supabase
        .from('courts')
        .select('*, locations(tenant_id)')
        .eq('id', data.court_id)
        .single();

      if (courtError || !court) {
        throw new NotFoundError('Court not found');
      }

      if (!court) {
        throw new NotFoundError('Court not found');
      }

      if ((court.locations as any).tenant_id !== data.tenant_id) {
        throw new ValidationError('Court does not belong to the specified tenant');
      }

      // Check court availability
      await this.checkCourtAvailability(
        data.court_id,
        data.booking_date,
        data.start_time,
        data.end_time
      );

      // Calculate duration and pricing using strategy pattern
      const duration = this.calculateDuration(data.start_time, data.end_time);
      const courtPrice = await this.pricingService.calculatePrice(
        data.court_id,
        data.booking_date,
        data.start_time,
        data.end_time,
        court,
        'rule-based'
      );

      // Create main booking record
      const bookingData: CreateBooking = {
        court_id: data.court_id,
        user_id: userId,
        tenant_id: data.tenant_id,
        booking_number: this.generateBookingNumber(),
        total_price: courtPrice,
        status: 'pending',
        notes: data.notes,
        booking_type: data.booking_type || 'single',
        recurrence_pattern: data.recurrence_pattern || null,
        days_of_week: data.days_of_week || null,
        start_date: data.start_date?.toISOString() || null,
        end_date: data.end_date?.toISOString() || null,
        total_sessions: data.total_sessions || 1,
        completed_sessions: 0,
        cancelled_sessions: 0,
        product_total: 0,
      };

      const savedBooking = await this.bookingRepository.createBooking(bookingData);

      // Create booked slot(s) using factory pattern
      const bookingType = data.booking_type || 'single';
      const creator = this.bookingFactory.getCreator(bookingType as BookingType);
      await creator.create({ ...data, bookingId: savedBooking.id });

      // Handle products if provided
      let productTotal = 0;
      if (data.products && data.products.length > 0) {
        productTotal = await this.addProductsToBooking(savedBooking.id, data.products, data.tenant_id);
      }

      // Update booking with product total
      if (productTotal > 0) {
        const updatedBooking = await this.bookingRepository.updateBooking(savedBooking.id, {
          product_total: productTotal,
          total_price: courtPrice + productTotal,
        });
        return updatedBooking;
      }

      return savedBooking;
  }

  async getBookings(filters: BookingFilters): Promise<Booking[]> {
    return this.bookingRepository.findWithFilters(filters);
  }

  async getBookingById(id: number): Promise<Booking> {
    const booking = await this.bookingRepository.findById(id);

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    return booking;
  }

  async updateBookingStatus(id: number, status: BookingStatus, notes?: string): Promise<Booking> {
    const booking = await this.bookingRepository.findById(id);

    // Update booking status
    const updateData: any = { status };
    if (notes) {
      updateData.notes = notes;
    }

    const updatedBooking = await this.bookingRepository.updateBooking(id, updateData);

    // Update all booked slots status accordingly
    const slotStatus = this.mapBookingStatusToSlotStatus(status);
    await supabase
      .from('booked_slots')
      .update({ status: slotStatus })
      .eq('booking_id', id);

    return updatedBooking;
  }

  async getAvailableCourts(filters: AvailableCourtFilters): Promise<Court[]> {
    // Get all courts for the tenant
    let query = supabase
      .from('courts')
      .select(`
        *,
        locations!inner(id, tenant_id, name),
        facilities(id, name)
      `)
      .eq('locations.tenant_id', filters.tenant_id)
      .eq('status', 'active');

    if (filters.facility_id) {
      query = query.eq('facility_id', filters.facility_id);
    }

    const { data: courts, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Check for conflicts with existing bookings
    const { data: conflictingSlots, error: slotsError } = await supabase
      .from('booked_slots')
      .select('court_id')
      .eq('slot_date', filters.date.toISOString().split('T')[0])
      .neq('status', 'cancelled')
      .lt('start_time', filters.end_time)
      .gt('end_time', filters.start_time);

    if (slotsError) {
      throw new Error(slotsError.message);
    }

    const bookedCourtIds = conflictingSlots?.map(slot => slot.court_id) || [];

    // Filter out booked courts
    const availableCourts = courts?.filter(court => !bookedCourtIds.includes(court.id)) || [];

    return availableCourts as Court[];
  }

  async getBookingStatistics(tenantId: number, startDate?: Date, endDate?: Date) {
    return this.bookingRepository.getBookingStatistics(tenantId, startDate, endDate);
  }

  private async checkCourtAvailability(
    courtId: number,
    date: Date,
    startTime: string,
    endTime: string
  ): Promise<void> {
    // Check for conflicting booked slots
    const { data: conflictingSlots, error } = await supabase
      .from('booked_slots')
      .select('*')
      .eq('court_id', courtId)
      .eq('slot_date', date.toISOString().split('T')[0])
      .neq('status', 'cancelled');

    if (error) {
      throw new Error(error.message);
    }

    if (conflictingSlots) {
      for (const slot of conflictingSlots) {
        if (this.timesOverlap(startTime, endTime, slot.start_time, slot.end_time)) {
          throw new ConflictError('Court is not available at the requested time');
        }
      }
    }

    // Check for unavailable times
    const { data: unavailableTimes, error: unavailableError } = await supabase
      .from('unavailable_times')
      .select('*')
      .eq('court_id', courtId)
      .lte('start_datetime', date.toISOString())
      .gte('end_datetime', date.toISOString());

    if (unavailableError) {
      throw new Error(unavailableError.message);
    }

    if (unavailableTimes) {
      for (const unavailable of unavailableTimes) {
        const unavailableStart = new Date(unavailable.start_datetime);
        const unavailableEnd = new Date(unavailable.end_datetime);
        const unavailableStartTime = unavailableStart.toTimeString().substring(0, 5);
        const unavailableEndTime = unavailableEnd.toTimeString().substring(0, 5);
        
        if (this.timesOverlap(startTime, endTime, unavailableStartTime, unavailableEndTime)) {
          throw new ConflictError('Court is unavailable at the requested time');
        }
      }
    }
  }

  private timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    return start1 < end2 && end1 > start2;
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return (end.getTime() - start.getTime()) / (1000 * 60); // minutes
  }




  private async addProductsToBooking(
    bookingId: number,
    products: Array<{ product_id: number; quantity: number }>,
    tenantId: number
  ): Promise<number> {
    let total = 0;

    for (const productData of products) {
      // Get product
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productData.product_id)
        .eq('tenant_id', tenantId)
        .single();

      if (productError || !product) {
        throw new NotFoundError(`Product with id ${productData.product_id} not found`);
      }

      if (product.current_stock < productData.quantity) {
        throw new ValidationError(`Insufficient stock for product ${product.name}`);
      }

      const totalPrice = product.price * productData.quantity;
      total += totalPrice;

      // Create booking product record
      const bookingProductData: CreateBookingProduct = {
        booking_id: bookingId,
        product_id: productData.product_id,
        quantity: productData.quantity,
        unit_price: product.price,
        total_price: totalPrice,
      };

      const { error: bookingProductError } = await supabase
        .from('booking_products')
        .insert(bookingProductData);

      if (bookingProductError) {
        throw new Error(bookingProductError.message);
      }

      // Update product stock
      const { error: stockError } = await supabase
        .from('products')
        .update({ current_stock: product.current_stock - productData.quantity })
        .eq('id', productData.product_id);

      if (stockError) {
        throw new Error(stockError.message);
      }
    }

    return total;
  }

  private generateBookingNumber(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `BK-${timestamp}-${random}`.toUpperCase();
  }

  private mapBookingStatusToSlotStatus(bookingStatus: BookingStatus): BookedSlotStatus {
    switch (bookingStatus) {
      case 'pending':
        return 'scheduled';
      case 'confirmed':
        return 'confirmed';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      case 'no_show':
        return 'no_show';
      default:
        return 'scheduled';
    }
  }
}