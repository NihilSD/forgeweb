import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AttemptsService } from './attempts.service.js';

/**
 * Spec 3.2: replays are deleted after 12 months. Runs every 6 hours inside the API (outside tests);
 * deletion is idempotent, so several API instances running it is harmless. The same purge is
 * available as `replays:purge` for manual runs.
 */
@Injectable()
export class ReplayPurgeScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('ReplayPurge');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    const tick = () =>
      this.attempts.purgeExpiredReplays().then(
        (n) => n > 0 && this.logger.log(`purged ${n} expired replay(s)`),
        (err: Error) => this.logger.error(err.message),
      );
    void tick();
    this.timer = setInterval(tick, 6 * 3_600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
