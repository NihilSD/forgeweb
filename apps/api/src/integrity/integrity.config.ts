/**
 * Every integrity-score weight lives here (spec 7.4: "weights live in one config file and are
 * tuned with real data"). Each signal is documented in docs/decisions/integrity-score.md.
 * Changing a number here changes scoring for new attempts only; stored scores are not recomputed.
 */
export const INTEGRITY = {
  /** Score before any signal is applied. */
  base: 50,
  /** ≥ verified → verified; ≥ review → unverified (shown, not counted); below → human review. */
  thresholds: { verified: 70, review: 40 },

  /** Strongest signal. Linear in the share of correct answers: all right → +30, all wrong → −40. */
  followUps: { allCorrect: 30, allWrong: -40 },

  paste: {
    /** Pastes shorter than this are ignored (a variable name, a line). */
    minChars: 40,
    /** Applied in full when outside pastes add up to the length of the final solution. */
    maxPenalty: 35,
    /** One edit inserting at least this much text with no paste event is treated as a paste. */
    unannouncedInsertChars: 120,
  },

  /** Final code that the recorded edits cannot reproduce (events missing or forged). */
  replayMismatch: { penalty: 25 },

  focus: {
    /** Time out of focus allowed in total before it counts. */
    graceMs: 60_000,
    /** Penalty per minute beyond the grace period. */
    perMinute: 6,
    maxPenalty: 30,
  },

  fullscreen: { perExit: 1, maxPenalty: 5 },

  speed: {
    /** Verified solves needed before the problem's own median is used. */
    minSamples: 10,
    /** Without enough samples, typical time = this share of the time budget. */
    fallbackTypicalFraction: 0.4,
    /** Solve time as a share of the typical time → penalty. First matching tier wins. */
    tiers: [
      { below: 0.1, penalty: 15 },
      { below: 0.25, penalty: 7 },
    ],
  },

  editing: {
    /** At least this many edit events count as incremental typing. */
    minEdits: 20,
    editsBonus: 5,
    /** At least one run before the final submit. */
    runBonus: 5,
    /** A failing run or submit later followed by a passing one. */
    fixBonus: 5,
  },

  trust: { emailVerified: 2, minAgeDays: 30, ageBonus: 2, priorVerifiedBonus: 1 },
} as const;

export type IntegrityConfig = typeof INTEGRITY;
