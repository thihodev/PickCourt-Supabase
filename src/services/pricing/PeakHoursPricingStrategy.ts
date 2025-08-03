import { Court } from '../../types';
import { PricingStrategy, PricingContext } from './PricingStrategy';
import { DefaultPricingStrategy } from './DefaultPricingStrategy';

export class PeakHoursPricingStrategy implements PricingStrategy {
  private fallbackStrategy = new DefaultPricingStrategy();
  private peakMultiplier: number;
  private peakStartTime: string;
  private peakEndTime: string;

  constructor(peakMultiplier = 1.5, peakStartTime = '17:00', peakEndTime = '21:00') {
    this.peakMultiplier = peakMultiplier;
    this.peakStartTime = peakStartTime;
    this.peakEndTime = peakEndTime;
  }

  async calculatePrice(context: PricingContext, court: Court): Promise<number> {
    const basePrice = await this.fallbackStrategy.calculatePrice(context, court);
    
    if (this.isPeakTime(context.startTime, context.endTime)) {
      return basePrice * this.peakMultiplier;
    }

    return basePrice;
  }

  private isPeakTime(startTime: string, endTime: string): boolean {
    return startTime >= this.peakStartTime && endTime <= this.peakEndTime;
  }
}