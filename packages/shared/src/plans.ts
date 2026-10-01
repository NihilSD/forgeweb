/**
 * Section 10. The single source of truth for plan limits. Enforced only in the API
 * through EntitlementsService; the web app reads entitlements to show locks, never to decide.
 */
export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export const FEATURES = [
  'unlimited_hints',
  'editorials',
  'review_queue',
  'study_plans',
  'unlimited_verified',
  'all_lessons',
] as const;
export type Feature = (typeof FEATURES)[number];

export interface PlanLimits {
  /** Hint levels a user may reveal per UTC day. null = unlimited. */
  hintLevelsPerDay: number | null;
  /** Verified challenge attempts per ISO week. null = unlimited. */
  verifiedPerWeek: number | null;
  /** Streak freezes granted per calendar month. */
  streakFreezesPerMonth: number;
  /** Lessons open per course (by order). null = all. */
  freeLessonsPerCourse: number | null;
  features: readonly Feature[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    hintLevelsPerDay: 3,
    verifiedPerWeek: 3,
    streakFreezesPerMonth: 2,
    freeLessonsPerCourse: 3,
    features: [],
  },
  pro: {
    hintLevelsPerDay: null,
    verifiedPerWeek: null,
    streakFreezesPerMonth: 5,
    freeLessonsPerCourse: null,
    features: FEATURES,
  },
};

/**
 * Prices in integer minor units. Stripe holds the real prices (one Price per tier and interval);
 * these are the amounts shown before checkout and must match them.
 * Spec 10: Romania and similar markets pay 40–60% less.
 */
export const PRICE_TIERS = ['standard', 'reduced'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];
export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PLAN_PRICES: Record<
  PriceTier,
  Record<BillingInterval, { amount: number; currency: 'eur' }>
> = {
  standard: { month: { amount: 1200, currency: 'eur' }, year: { amount: 9900, currency: 'eur' } },
  reduced: { month: { amount: 600, currency: 'eur' }, year: { amount: 4900, currency: 'eur' } },
};

/** ISO 3166-1 alpha-2 countries on the reduced tier. */
export const REDUCED_PRICE_COUNTRIES = [
  'RO',
  'BG',
  'MD',
  'RS',
  'MK',
  'AL',
  'BA',
  'ME',
  'UA',
] as const;

export function priceTierFor(country: string | null | undefined): PriceTier {
  return country && (REDUCED_PRICE_COUNTRIES as readonly string[]).includes(country.toUpperCase())
    ? 'reduced'
    : 'standard';
}

/** Days a subscription keeps Pro after a failed payment before downgrade. */
export const PAYMENT_GRACE_DAYS = 7;
