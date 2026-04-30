'use server';

import { setThemeCookie, type Theme } from '@/lib/theme';

export async function setThemeAction(theme: Theme): Promise<void> {
  await setThemeCookie(theme);
}
