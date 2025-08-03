import { Court } from '../../types';
import { PricingStrategy, PricingContext } from './PricingStrategy';

export class DefaultPricingStrategy implements PricingStrategy {
  async calculatePrice(context: PricingContext, court: Court): Promise<number> {
    return (court.price_per_hour * context.duration) / 60;
  }
}