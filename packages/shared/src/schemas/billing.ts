import { z } from 'zod';
import { BILLING_INTERVALS, PLANS, PRICE_TIERS } from '../plans.js';

export const checkoutSchema = z.object({ interval: z.enum(BILLING_INTERVALS) });

export const priceListSchema = z.object({
  tier: z.enum(PRICE_TIERS),
  prices: z.array(
    z.object({ interval: z.enum(BILLING_INTERVALS), amount: z.number(), currency: z.string() }),
  ),
  /** False when Stripe is not configured (checkout buttons are disabled). */
  available: z.boolean(),
});
export type PriceList = z.infer<typeof priceListSchema>;

export const billingStatusSchema = z.object({
  plan: z.enum(PLANS),
  /** Null when the user has never subscribed. */
  subscription: z
    .object({
      status: z.string(),
      interval: z.string().nullable(),
      currentPeriodEnd: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
      /** Set after a failed payment: Pro stays until then (7-day grace). */
      graceUntil: z.string().nullable(),
    })
    .nullable(),
  hasCustomer: z.boolean(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;

export const invoiceListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      number: z.string().nullable(),
      date: z.string(),
      /** Integer minor units. */
      total: z.number(),
      currency: z.string(),
      status: z.string().nullable(),
      hostedUrl: z.string().nullable(),
      pdfUrl: z.string().nullable(),
    }),
  ),
});
export type InvoiceList = z.infer<typeof invoiceListSchema>;

export const redirectUrlSchema = z.object({ url: z.string() });
