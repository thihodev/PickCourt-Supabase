import { Court } from '../../types';
import { PricingStrategy, PricingContext } from './PricingStrategy';
import { RuleBasedPricingStrategy } from './RuleBasedPricingStrategy';
import { PeakHoursPricingStrategy } from './PeakHoursPricingStrategy';
import { DefaultPricingStrategy } from './DefaultPricingStrategy';

export type PricingStrategyType = 'default' | 'rule-based' | 'peak-hours';

export class PricingService {
  private strategies: Map<PricingStrategyType, PricingStrategy> = new Map();

  constructor() {
    this.strategies.set('default', new DefaultPricingStrategy());
    this.strategies.set('rule-based', new RuleBasedPricingStrategy());
    this.strategies.set('peak-hours', new PeakHoursPricingStrategy());
  }

  async calculatePrice(
    courtId: number,
    date: Date,
    startTime: string,
    endTime: string,
    court: Court,
    strategyType: PricingStrategyType = 'rule-based'
  ): Promise<number> {
    const duration = this.calculateDuration(startTime, endTime);
    const dayOfWeek = date.getDay();

    const context: PricingContext = {
      courtId,
      date,
      startTime,
      endTime,
      duration,
      dayOfWeek,
    };

    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      throw new Error(`Unknown pricing strategy: ${strategyType}`);
    }

    return strategy.calculatePrice(context, court);
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  }
}