import type { Metadata, Viewport } from 'next';
import './globals.css';
import { readTheme, DEFAULT_THEME } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Forge',
  description: 'Capture, research, and pressure-test your ideas.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Forge',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0e0f12',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await readTheme();
  // data-theme is only set when non-default to keep markup minimal.
  const themeAttr = theme === DEFAULT_THEME ? undefined : theme;
  return (
    <html lang="en" data-theme={themeAttr}>
      <body>{children}</body>
    </html>
  );
}
