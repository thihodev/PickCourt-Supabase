import { Court } from '../../types';

export interface PricingContext {
  courtId: number;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  dayOfWeek: number;
}

export interface PricingStrategy {
  calculatePrice(context: PricingContext, court: Court): Promise<number>;
}