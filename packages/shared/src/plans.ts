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

/** Prices in integer minor units (cents). Regional prices live in Stripe; these are defaults. */
export const PLAN_PRICES = {
  pro_monthly: { amount: 1200, currency: 'eur', interval: 'month' },
  pro_yearly: { amount: 9900, currency: 'eur', interval: 'year' },
} as const;
export type PriceKey = keyof typeof PLAN_PRICES;

/** Days a subscription keeps Pro after a failed payment before downgrade. */
export const PAYMENT_GRACE_DAYS = 7;
