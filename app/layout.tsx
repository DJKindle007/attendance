import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Kindle Attendance',
  description: 'Late check-in, attendance reminders and family notices for Kindle Education Middle School.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.className}>
      <body>{children}</body>
    </html>
  );
}
