import './globals.css';
import React from 'react';
export const metadata = { title: 'Persian Scholarly Transliterator', description: 'A provenance-aware IJMES transliteration foundation.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
