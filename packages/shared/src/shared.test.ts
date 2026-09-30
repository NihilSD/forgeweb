import { describe, expect, it } from 'vitest';
import { FEATURES, PLAN_LIMITS, PLAN_PRICES } from './plans.js';
import { emailSchema, handleSchema, onboardingSchema, signupSchema } from './schemas/auth.js';
import { problemListQuerySchema } from './schemas/problems.js';

describe('auth schemas', () => {
  it('normalises emails', () => {
    expect(emailSchema.parse('  Ana@Example.COM ')).toBe('ana@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('requires 10+ character passwords and accepted terms', () => {
    expect(
      signupSchema.safeParse({ email: 'a@b.co', password: 'short', acceptTerms: true }).success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ email: 'a@b.co', password: 'long-enough-1', acceptTerms: false })
        .success,
    ).toBe(false);
    expect(
      signupSchema.safeParse({ email: 'a@b.co', password: 'long-enough-1', acceptTerms: true })
        .success,
    ).toBe(true);
  });

  it('validates handles and time zones', () => {
    expect(handleSchema.parse('Ana_Pop')).toBe('ana_pop');
    expect(handleSchema.safeParse('-bad').success).toBe(false);
    const base = { handle: 'ana', displayName: 'Ana', birthYear: 1990, goal: 'learn' as const };
    expect(onboardingSchema.safeParse({ ...base, timeZone: 'Europe/Bucharest' }).success).toBe(
      true,
    );
    expect(onboardingSchema.safeParse({ ...base, timeZone: 'Mars/Olympus' }).success).toBe(false);
  });
});

describe('plans', () => {
  it('keeps Pro at least as generous as Free', () => {
    const free = PLAN_LIMITS.free;
    const pro = PLAN_LIMITS.pro;
    expect(pro.hintLevelsPerDay).toBeNull();
    expect(pro.verifiedPerWeek).toBeNull();
    expect(pro.streakFreezesPerMonth).toBeGreaterThanOrEqual(free.streakFreezesPerMonth);
    expect([...pro.features].sort()).toEqual([...FEATURES].sort());
  });

  it('matches the spec defaults', () => {
    expect(PLAN_LIMITS.free.verifiedPerWeek).toBe(3);
    expect(PLAN_LIMITS.free.hintLevelsPerDay).toBe(3);
    expect(PLAN_LIMITS.free.streakFreezesPerMonth).toBe(2);
    expect(PLAN_LIMITS.pro.streakFreezesPerMonth).toBe(5);
    expect(PLAN_PRICES.pro_monthly).toMatchObject({ amount: 1200, currency: 'eur' });
    expect(PLAN_PRICES.pro_yearly).toMatchObject({ amount: 9900, currency: 'eur' });
  });
});

describe('problem list query', () => {
  it('caps page size at 100', () => {
    expect(problemListQuerySchema.safeParse({ limit: '100' }).success).toBe(true);
    expect(problemListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(problemListQuerySchema.parse({}).limit).toBe(30);
  });
});
