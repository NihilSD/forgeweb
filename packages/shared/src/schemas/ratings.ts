import { z } from 'zod';

/** One rated event in a user's history (shown only once the rating is out of placement). */
export const ratingHistoryItemSchema = z.object({
  at: z.string(),
  kind: z.enum(['verified', 'contest', 'duel']),
  rating: z.number().int(),
  change: z.number().int(),
  result: z.enum(['solved', 'not_solved']),
  problem: z.object({ slug: z.string(), title: z.string() }).nullable(),
});
export type RatingHistoryItem = z.infer<typeof ratingHistoryItemSchema>;

/**
 * Spec 8: a rating per track, hidden until 5 rated events. While hidden, only the count is
 * returned, never the provisional value.
 */
export const trackRatingSchema = z.object({
  track: z.object({ slug: z.string(), name: z.string() }),
  rating: z.number().int().nullable(),
  /** Plus-or-minus band (about 2 RD) while visible; null in placement. */
  uncertainty: z.number().int().nullable(),
  events: z.number().int(),
  placementRemaining: z.number().int(),
  history: z.array(ratingHistoryItemSchema),
});
export type TrackRating = z.infer<typeof trackRatingSchema>;

export const myRatingsSchema = z.object({ tracks: z.array(trackRatingSchema) });
export type MyRatings = z.infer<typeof myRatingsSchema>;
