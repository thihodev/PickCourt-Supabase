import { BookingType } from '../../types';
import { CreateBookingData } from '../BookingService';

export interface BookingCreator {
  create(data: CreateBookingData & { bookingId?: number }): Promise<void>;
}

export class BookingFactory {
  private creators: Map<BookingType, BookingCreator> = new Map();

  registerCreator(type: BookingType, creator: BookingCreator): void {
    this.creators.set(type, creator);
  }

  getCreator(type: BookingType): BookingCreator {
    const creator = this.creators.get(type);
    if (!creator) {
      throw new Error(`No creator registered for booking type: ${type}`);
    }
    return creator;
  }
}