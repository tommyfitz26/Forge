// Server-side theme helpers. Stored in a cookie so SSR can render the right
// palette on first paint (no FOUC). Mirrored to localStorage on the client.
//
// See UI-REDESIGN-SPEC.md §7.5 (theme switcher mechanics).

import { cookies } from 'next/headers';

export const THEME_COOKIE = 'forge_theme';
export const THEMES = ['graphite', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'graphite';

function isTheme(value: string | undefined): value is Theme {
  return value === 'graphite' || value === 'light';
}

/**
 * Read the user's theme preference from the cookie. Falls back to default.
 * Server-only.
 */
export async function readTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * Persist theme to the cookie. Wrapped by a 'use server' action in
 * components/ui/theme-action.ts (Next.js requires server actions to live in
 * a 'use server' module, so this stays a plain helper).
 *
 * Cookie lives 1 year; httpOnly:false because the picker mirrors it to
 * localStorage on the client.
 */
export async function setThemeCookie(theme: Theme): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
