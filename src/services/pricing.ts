import type { Database, PricingRule, PricingCalculation } from '../types/index.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PricingContext {
  courtId: string;
  startTime: Date;
  endTime: Date;
  bookingType: 'single' | 'recurring' | 'membership';
  userId: string;
}

export class PricingService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private tenantId: string
  ) {}

  async calculatePrice(context: PricingContext): Promise<PricingCalculation> {
    const court = await this.getCourt(context.courtId);
    if (!court) {
      throw new Error('Court not found');
    }

    const basePrice = this.calculateBasePrice(court.hourly_rate, context.startTime, context.endTime);
    const rules = await this.getApplicableRules(context);
    
    const calculation: PricingCalculation = {
      basePrice,
      appliedRules: rules,
      adjustments: [],
      totalPrice: basePrice
    };

    for (const rule of rules) {
      const adjustment = this.applyRule(rule, calculation.totalPrice, context);
      calculation.adjustments.push(adjustment);
      
      if (adjustment.type === 'multiplier') {
        calculation.totalPrice *= adjustment.amount;
      } else {
        calculation.totalPrice += adjustment.amount;
      }
    }

    calculation.totalPrice = Math.round(calculation.totalPrice * 100) / 100;
    
    return calculation;
  }

  private calculateBasePrice(hourlyRate: number, startTime: Date, endTime: Date): number {
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    return hourlyRate * hours;
  }

  private async getCourt(courtId: string) {
    const { data } = await this.supabase
      .from('courts')
      .select('*')
      .eq('id', courtId)
      .eq('tenant_id', this.tenantId)
      .single();
    
    return data;
  }

  private async getApplicableRules(context: PricingContext): Promise<PricingRule[]> {
    const rules: PricingRule[] = [
      {
        id: 'peak-hours',
        name: 'Peak Hours',
        type: 'peak_hours',
        conditions: { startHour: 18, endHour: 22 },
        multiplier: 1.5,
        priority: 1
      },
      {
        id: 'weekend',
        name: 'Weekend Premium',
        type: 'day_of_week',
        conditions: { daysOfWeek: [6, 0] },
        multiplier: 1.2,
        priority: 2
      },
      {
        id: 'membership-discount',
        name: 'Membership Discount',
        type: 'membership',
        conditions: { bookingType: 'membership' },
        multiplier: 0.8,
        priority: 3
      }
    ];

    return rules
      .filter(rule => this.isRuleApplicable(rule, context))
      .sort((a, b) => a.priority - b.priority);
  }

  private isRuleApplicable(rule: PricingRule, context: PricingContext): boolean {
    switch (rule.type) {
      case 'peak_hours':
        const hour = context.startTime.getHours();
        return hour >= rule.conditions.startHour && hour < rule.conditions.endHour;
      
      case 'day_of_week':
        const dayOfWeek = context.startTime.getDay();
        return rule.conditions.daysOfWeek.includes(dayOfWeek);
      
      case 'membership':
        return context.bookingType === rule.conditions.bookingType;
      
      default:
        return false;
    }
  }

  private applyRule(rule: PricingRule, currentPrice: number, context: PricingContext) {
    if (rule.fixed_amount) {
      return {
        rule: rule.name,
        amount: rule.fixed_amount,
        type: 'fixed' as const
      };
    }

    return {
      rule: rule.name,
      amount: rule.multiplier,
      type: 'multiplier' as const
    };
  }
}