import Stripe from 'stripe';

/**
 * The part of the Stripe SDK the API uses. Tests swap in a fake with the same shape; webhook
 * signatures are always checked with the real SDK.
 */
export interface StripeApi {
  customers: { create(params: Stripe.CustomerCreateParams): Promise<{ id: string }> };
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: Stripe.BillingPortal.SessionCreateParams): Promise<{ url: string }>;
    };
  };
  invoices: {
    list(params: Stripe.InvoiceListParams): Promise<{ data: Stripe.Invoice[] }>;
  };
}

export const STRIPE_API = Symbol('STRIPE_API');

/** Null when STRIPE_SECRET_KEY is not set: billing endpoints then answer 503. */
export function createStripeApi(secretKey: string | undefined): StripeApi | null {
  return secretKey ? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 }) : null;
}

/** Signature verification needs no API key; any placeholder works for the SDK instance. */
const verifier = new Stripe('sk_signature_verification_only');

export function constructEvent(rawBody: string, signature: string, secret: string): Stripe.Event {
  return verifier.webhooks.constructEvent(rawBody, signature, secret);
}

/** Test helper: a valid Stripe-Signature header for `payload`. */
export function testSignature(payload: string, secret: string): string {
  return verifier.webhooks.generateTestHeaderString({ payload, secret });
}

export type { Stripe };
