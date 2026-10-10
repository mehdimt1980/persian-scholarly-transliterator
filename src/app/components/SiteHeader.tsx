'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHeader() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Transliterate' },
    { href: '/bibliography', label: 'Bibliography' },
    { href: '/review', label: 'Scholarly Review' },
    { href: '/method', label: 'Method' },
    { href: '/about', label: 'About' }
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label="Persian Scholarly Transliterator home">
          <span className="brand-title">Persian Scholarly Transliterator</span>
        </Link>
        <nav className="site-nav" aria-label="Main Navigation">
          <ul className="nav-list">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href} className="nav-item">
                  <Link
                    href={item.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="nav-item">
              <a
                href="https://github.com/mehdimt1980/persian-scholarly-transliterator"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link nav-github"
                aria-label="GitHub repository (opens in new tab)"
              >
                GitHub <span className="ext-icon" aria-hidden="true">↗</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
