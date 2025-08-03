import { Court } from '../../types';
import { supabase } from '../../config/database';
import { PricingStrategy, PricingContext } from './PricingStrategy';
import { DefaultPricingStrategy } from './DefaultPricingStrategy';

export class RuleBasedPricingStrategy implements PricingStrategy {
  private fallbackStrategy = new DefaultPricingStrategy();

  async calculatePrice(context: PricingContext, court: Court): Promise<number> {
    const { data: priceRule, error } = await supabase
      .from('price_rules')
      .select('*')
      .eq('court_id', context.courtId)
      .or(`day_of_week.is.null,day_of_week.eq.${context.dayOfWeek}`)
      .lte('start_time', context.startTime)
      .gte('end_time', context.endTime)
      .order('day_of_week', { ascending: false })
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (priceRule) {
      return (priceRule.price * context.duration) / 60;
    }

    return this.fallbackStrategy.calculatePrice(context, court);
  }
}