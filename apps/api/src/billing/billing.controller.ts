import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { User } from '@forge/db';
import {
  billingStatusSchema,
  checkoutSchema,
  ErrorCode,
  invoiceListSchema,
  priceListSchema,
  redirectUrlSchema,
} from '@forge/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import {
  CurrentUser,
  type ForgeRequest,
  Public,
  RequireVerifiedEmail,
  SkipCsrf,
} from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { RateClassOf, RateLimit } from '../rate-limit/rate-limit.guard.js';
import { BillingQueueService } from './billing-queue.service.js';
import { BillingService } from './billing.service.js';
import { constructEvent } from './stripe-client.js';

@Controller('billing')
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(BillingQueueService) private readonly queue: BillingQueueService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Public: the pricing page shows the visitor's regional price when signed in. */
  @Public()
  @Get('prices')
  @ResponseSchema(priceListSchema)
  prices(@Req() req: ForgeRequest) {
    return this.billing.prices(req.auth?.user.country ?? null);
  }

  @Get('status')
  @ResponseSchema(billingStatusSchema)
  status(@CurrentUser() user: User) {
    return this.billing.status(user);
  }

  @Post('checkout')
  @HttpCode(200)
  @RequireVerifiedEmail()
  @RateLimit({ bucket: 'checkout', by: 'user', limit: 10, windowSec: 3600 })
  @ResponseSchema(redirectUrlSchema)
  checkout(
    @Body(new ZodPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
    @CurrentUser() user: User,
  ) {
    return this.billing.checkout(user, body.interval);
  }

  @Post('portal')
  @HttpCode(200)
  @ResponseSchema(redirectUrlSchema)
  portal(@CurrentUser() user: User) {
    return this.billing.portal(user);
  }

  @Get('invoices')
  @ResponseSchema(invoiceListSchema)
  invoices(@CurrentUser() user: User) {
    return this.billing.invoices(user);
  }

  /**
   * Stripe webhooks. Authenticated by the Stripe-Signature header over the raw body (app.ts keeps
   * this route's body raw); no session or CSRF. Verified events are stored and queued, never
   * processed inline, so Stripe always gets a fast 200.
   */
  @Public()
  @SkipCsrf()
  @Post('webhook')
  @RateClassOf('webhook')
  @HttpCode(200)
  @ResponseSchema(z.object({ received: z.literal(true), duplicate: z.boolean() }))
  async webhook(@Req() req: Request) {
    const secret = this.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, 'Webhooks are not configured.');
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const signature = req.header('stripe-signature');
    if (!raw || !signature) throw new ApiError(ErrorCode.UNAUTHENTICATED, 'Missing signature.');
    let event;
    try {
      event = constructEvent(raw, signature, secret);
    } catch {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, 'Invalid webhook signature.');
    }
    const fresh = await this.queue.accept(event);
    return { received: true as const, duplicate: !fresh };
  }
}
