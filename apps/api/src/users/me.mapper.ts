import type { User } from '@forge/db';
import { ADULT_AGE, type Me, type Plan } from '@forge/shared';

export const DELETION_GRACE_DAYS = 30;

export function isMinor(birthYear: number | null, now = new Date()): boolean {
  return birthYear !== null && now.getUTCFullYear() - birthYear < ADULT_AGE;
}

export function toMe(user: User, extra: { twoFactorEnabled: boolean; plan: Plan }): Me {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    handle: user.handle,
    displayName: user.displayName,
    country: user.country,
    timeZone: user.timeZone,
    role: user.role,
    goal: user.goal,
    languages: user.languages,
    onboarded: user.onboardedAt !== null,
    isMinor: isMinor(user.birthYear),
    twoFactorEnabled: extra.twoFactorEnabled,
    hasPassword: user.passwordHash !== null,
    emailDigestOptIn: user.emailDigestOptIn,
    deletionScheduledFor: user.deletionRequestedAt
      ? new Date(
          user.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000,
        ).toISOString()
      : null,
    plan: extra.plan,
    createdAt: user.createdAt.toISOString(),
  };
}
