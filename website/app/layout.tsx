import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import { blogTitle, blogDescription, blogSubtitle } from '../lib/blog-routes';

export const metadata: Metadata = {
  metadataBase: new URL('https://codezen1729.github.io/math-blog/'),
  title: {
    default: blogTitle,
    template: `%s · ${blogTitle}`,
  },
  description: blogDescription,
  applicationName: blogTitle,
  authors: [{ name: 'S. Viswanathan' }],
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: blogTitle,
    siteName: blogTitle,
    description: blogDescription,
    type: 'website',
    images: [{ url: './og.png', width: 1731, height: 909, alt: `${blogTitle} — ${blogSubtitle}` }],
  },
  twitter: { card: 'summary_large_image', title: blogTitle, description: blogDescription, images: [{ url: './og.png', alt: `${blogTitle} — ${blogSubtitle}` }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
