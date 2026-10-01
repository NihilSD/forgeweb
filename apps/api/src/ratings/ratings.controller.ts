import { Controller, Get, Inject } from '@nestjs/common';
import type { User } from '@forge/db';
import { myRatingsSchema } from '@forge/shared';
import { CurrentUser } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { RatingsService } from './ratings.service.js';

@Controller()
export class RatingsController {
  constructor(@Inject(RatingsService) private readonly ratings: RatingsService) {}

  /** The caller's own ratings per track (public profiles come in V1.7). */
  @Get('me/ratings')
  @ResponseSchema(myRatingsSchema)
  mine(@CurrentUser() user: User) {
    return this.ratings.forUser(user.id);
  }
}
