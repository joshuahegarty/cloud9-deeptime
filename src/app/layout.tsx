import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Cloud9 Fulfilment — Task Timer',
  description: 'Internal warehouse task and productivity timer for Cloud9 Fulfilment, Sheffield 3PL',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#090D16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en-GB" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('c9_theme');if(t==='light'){document.documentElement.classList.add('light');document.documentElement.classList.remove('dark');}else{document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
