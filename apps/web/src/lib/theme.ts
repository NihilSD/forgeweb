export const THEME_COOKIE = 'forge_theme';
export type Theme = 'dark' | 'light';
export function parseTheme(value: string | undefined): Theme {
  return value === 'light' ? 'light' : 'dark';
}
