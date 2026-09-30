import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service.js';

/**
 * Which problems a user has solved. Phase L4 adds submissions; until then nothing is solved.
 * Kept behind one service so the library, recommendations and profile agree on the definition.
 */
@Injectable()
export class SolvedService {
  resolver: (userId: string) => Promise<Set<string>> = async () => new Set();

  constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}

  solvedProblemIds(userId: string): Promise<Set<string>> {
    return this.resolver(userId);
  }
}
