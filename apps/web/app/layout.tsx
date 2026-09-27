import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JAMUS KALIMASADA',
  description: 'Security Assurance, Verification & Cyber Threat Intelligence Platform',
  icons: {
    icon: '/jamus_kalimasada_logo.png',
    shortcut: '/jamus_kalimasada_logo.png',
    apple: '/jamus_kalimasada_logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
