import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Woodstreet Studio',
  description: 'منصة إنتاج الصور والفيديوهات لمنتجات Woodstreet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
