import './globals.css';
import React from 'react';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';

export const metadata = {
  title: 'Persian Scholarly Transliterator',
  description:
    'Evidence-aware IJMES transliteration for Persian scholarship with explicit ambiguity handling and human-governed review.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-wrapper">
          <SiteHeader />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
