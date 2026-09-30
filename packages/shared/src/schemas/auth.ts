import { z } from 'zod';
import { LANGUAGES, PASSWORD_MIN_LENGTH, TRACK_SLUGS, USER_ROLES } from '../constants.js';

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address.' }))
  .transform((e) => e.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, 'Use at most 128 characters.');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'You need to accept the terms to continue.' }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const twoFactorVerifySchema = z.union([
  z.object({ code: z.string().regex(/^\d{6}$/) }),
  z.object({ recoveryCode: z.string().min(8).max(20) }),
]);

export const disableTwoFactorSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const handleSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(24, 'Use at most 24 characters.')
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i, 'Use letters, numbers, dashes and underscores.')
  .transform((h) => h.toLowerCase());

export const GOALS = ['learn', 'interview', 'compete', 'career-change', 'teach'] as const;
export type Goal = (typeof GOALS)[number];

const timeZoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone.');

export const onboardingSchema = z.object({
  handle: handleSchema,
  displayName: z.string().trim().min(1).max(60),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code.')
    .optional(),
  timeZone: timeZoneSchema,
  birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()),
  goal: z.enum(GOALS),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length).default([]),
  tracks: z.array(z.enum(TRACK_SLUGS)).max(TRACK_SLUGS.length).default([]),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    timeZone: timeZoneSchema,
    goal: z.enum(GOALS),
    languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length),
    emailDigestOptIn: z.boolean(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().max(128).optional(),
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
});

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  country: z.string().nullable(),
  timeZone: z.string(),
  role: z.enum(USER_ROLES),
  goal: z.string().nullable(),
  languages: z.array(z.string()),
  onboarded: z.boolean(),
  isMinor: z.boolean(),
  twoFactorEnabled: z.boolean(),
  hasPassword: z.boolean(),
  emailDigestOptIn: z.boolean(),
  deletionScheduledFor: z.string().nullable(),
  plan: z.enum(['free', 'pro']),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const sessionInfoSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const authResultSchema = z.object({
  status: z.enum(['ok', 'two_factor_required']),
  me: meSchema.nullable(),
});
export type AuthResult = z.infer<typeof authResultSchema>;

export const totpSetupSchema = z.object({ secret: z.string(), otpauthUrl: z.string() });
export const recoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });

export const OAUTH_PROVIDERS = ['github', 'google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
