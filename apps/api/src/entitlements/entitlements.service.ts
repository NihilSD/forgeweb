import { Injectable } from '@nestjs/common';
import { type Entitlements, ErrorCode, type Feature, type Plan, PLAN_LIMITS } from '@forge/shared';
import { ApiError } from '../common/api-error.js';

/**
 * The only place plan limits are decided (CLAUDE.md). Limits come from packages/shared/plans.ts;
 * the plan comes from billing (phase L10 installs a subscription-backed resolver).
 */
@Injectable()
export class EntitlementsService {
  planResolver: (userId: string) => Promise<Plan> = async () => 'free';

  plan(userId: string): Promise<Plan> {
    return this.planResolver(userId);
  }

  async get(userId: string): Promise<Entitlements> {
    const plan = await this.plan(userId);
    const l = PLAN_LIMITS[plan];
    return {
      plan,
      features: [...l.features],
      hintLevelsPerDay: l.hintLevelsPerDay,
      verifiedPerWeek: l.verifiedPerWeek,
      streakFreezesPerMonth: l.streakFreezesPerMonth,
    };
  }

  async has(userId: string, feature: Feature): Promise<boolean> {
    return PLAN_LIMITS[await this.plan(userId)].features.includes(feature);
  }

  /** Spec 10: Free includes the first lessons of each course; Pro includes all. */
  async lessonUnlocked(userId: string | null, order: number): Promise<boolean> {
    const free = PLAN_LIMITS.free.freeLessonsPerCourse;
    if (free === null || order <= free) return true;
    if (!userId) return false;
    return PLAN_LIMITS[await this.plan(userId)].freeLessonsPerCourse === null;
  }

  /** Throws PLAN_REQUIRED (402) when the user's plan lacks the feature. */
  async require(userId: string, feature: Feature, what: string): Promise<void> {
    if (!(await this.has(userId, feature))) {
      throw new ApiError(
        ErrorCode.PLAN_REQUIRED,
        `${what} ${what.endsWith('s') ? 'are' : 'is'} part of Forge Pro.`,
        {
          feature,
        },
      );
    }
  }
}
