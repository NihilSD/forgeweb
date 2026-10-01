import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AttemptsService } from '../attempts/attempts.service.js';
import { ENV, type Env } from '../config/env.js';
import { ProblemRatingService } from './problem-rating.service.js';
import { RatingsService } from './ratings.service.js';

/**
 * Every 10 minutes (outside tests): settle abandoned attempts, queue any final result without a
 * rating change, and run the weekly problem-rating job (once per ISO week, early on Monday UTC).
 */
@Injectable()
export class RatingsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RatingsScheduler');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(RatingsService) private readonly ratings: RatingsService,
    @Inject(ProblemRatingService) private readonly problems: ProblemRatingService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    const tick = async () => {
      try {
        await this.attempts.expireStale();
        await this.ratings.reconcile();
        const r = await this.problems.run();
        if (r.ran) this.logger.log(`problem ratings ${r.week}: ${r.updated} updated`);
      } catch (err) {
        this.logger.error((err as Error).message);
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), 10 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
