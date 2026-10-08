import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import { Oswald, Playfair_Display, Poppins } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { InstallBanner } from '@/components/install-banner';
import { ThemeProvider } from '@/providers/theme-provider';
import './globals.css';

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
});

const oswald = Oswald({
  variable: '--font-oswald',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Quantara',
  description: 'An AI tutor for curious minds.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    other: [
      { rel: 'mask-icon', url: '/icons/safari-pinned-tab.svg', color: '#4db8d4' },
    ],
  },
  appleWebApp: { capable: true, title: 'Quantara', statusBarStyle: 'black-translucent' },
  other: {
    'msapplication-config': '/icons/browserconfig.xml',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1424',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${poppins.variable} ${oswald.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <div className="site-background" aria-hidden="true">
          <picture>
            <source
              media="(max-width: 767px)"
              srcSet="/new-bg-828.webp"
              type="image/webp"
            />
            <source srcSet="/new-bg-1920.webp" type="image/webp" />
            <Image
              src="/new-bg.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              placeholder="blur"
              blurDataURL="data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAABQAQCdASoIAAYABoCQJQBOgCgAAP7tHvgRPu5v1UUjhLGFXl9bAAAA"
              className="object-cover"
            />
          </picture>
        </div>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
        <InstallBanner />
      </body>
    </html>
  );
}
