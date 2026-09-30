import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

/**
 * One transactional provider behind an interface (spec 2). Development sends to Mailpit over SMTP;
 * production points SMTP_URL at the provider. Tests keep messages in memory.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private readonly transport: Transporter | null;
  /** Test-only in-memory outbox. */
  readonly outbox: EmailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport =
      env.NODE_ENV === 'test' && !process.env.E2E ? null : nodemailer.createTransport(env.SMTP_URL);
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.transport) {
      this.outbox.push(message);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.env.EMAIL_FROM, ...message });
    } catch (err) {
      // Never log the message body: it can contain single-use tokens.
      this.logger.error(`Email delivery failed (${message.subject}): ${(err as Error).message}`);
    }
  }

  lastTo(to: string): EmailMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}
