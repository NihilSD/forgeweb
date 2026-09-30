export const LAUNCH_LANGUAGES = ['python', 'javascript', 'typescript', 'sql'] as const;
export const LANGUAGES = LAUNCH_LANGUAGES;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  sql: 'SQL',
};

export const TRACKS = [
  { slug: 'algorithms', name: 'Algorithms', order: 1 },
  { slug: 'debugging', name: 'Debugging', order: 2 },
  { slug: 'sql', name: 'SQL', order: 3 },
  { slug: 'security', name: 'Security', order: 4 },
] as const;
export type TrackSlug = (typeof TRACKS)[number]['slug'];
export const TRACK_SLUGS = TRACKS.map((t) => t.slug) as unknown as readonly [
  TrackSlug,
  ...TrackSlug[],
];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Section 8: initial problem rating by difficulty. */
export const DIFFICULTY_RATING: Record<Difficulty, number> = {
  easy: 1000,
  medium: 1400,
  hard: 1800,
  expert: 2200,
};

/** Section 8: XP for a solve by difficulty, before hint deductions. */
export const SOLVE_XP: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 40, expert: 80 };
export const LESSON_XP = 5;
export const DAILY_BONUS_XP = 10;
export const HINT_XP_PENALTY = 0.25;

export const FORMATS = [
  'write-code',
  'fix-code',
  'review',
  'predict',
  'flag',
  'terminal',
  'build',
] as const;
export type ProblemFormat = (typeof FORMATS)[number];
/** Formats supported by the launch runner and workspace. */
export const LAUNCH_FORMATS: readonly ProblemFormat[] = ['write-code', 'fix-code', 'flag'];

export const PROBLEM_MODES = ['practice', 'competitive', 'both'] as const;
export type ProblemMode = (typeof PROBLEM_MODES)[number];

/** Allowed concept tags. The validator rejects any tag not listed here. */
export const CONCEPT_TAGS = [
  'arrays',
  'strings',
  'hashing',
  'two-pointers',
  'sliding-window',
  'recursion',
  'bfs-dfs',
  'graphs',
  'binary-search',
  'sorting',
  'dynamic-programming',
  'greedy',
  'stacks',
  'queues',
  'math',
  'off-by-one',
  'null-handling',
  'types',
  'async',
  'state',
  'select',
  'joins',
  'aggregation',
  'window-functions',
  'subqueries',
  'crypto',
  'encoding',
  'forensics',
  'logs',
  'web-vulns',
  'injection',
  'xss',
  'auth',
  'secure-fix',
] as const;
export type ConceptTag = (typeof CONCEPT_TAGS)[number];

export const USER_ROLES = ['user', 'content_editor', 'moderator', 'support', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ADMIN_ROLES: readonly UserRole[] = [
  'content_editor',
  'moderator',
  'support',
  'superadmin',
];

export const MIN_AGE = 16;
export const ADULT_AGE = 18;
export const PASSWORD_MIN_LENGTH = 10;
export const PAGE_SIZE_MAX = 100;

/** Section 8: review queue intervals in days after a struggled problem. */
export const REVIEW_INTERVALS_DAYS = [2, 7, 21] as const;

/** Section 7: verified attempt defaults. */
export const VERIFIED_DEFAULT_MINUTES = 45;
export const FOLLOWUP_SECONDS = 90;
export const EVENT_BATCH_MS = 5000;
