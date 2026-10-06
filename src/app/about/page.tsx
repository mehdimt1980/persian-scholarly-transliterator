import React from 'react';

export const metadata = {
  title: 'About — Persian Scholarly Transliterator',
  description:
    'About the Persian Scholarly Transliterator project, creator attribution, and open research-software context.'
};

export default function AboutPage() {
  return (
    <article className="editorial-article">
      <header className="page-intro">
        <span className="page-intro-eyebrow">Project Context</span>
        <h1 className="page-title">About the Project</h1>
        <p className="page-tagline">
          An open research-software initiative for deterministic, provenance-aware, and human-governed Persian scholarly transliteration.
        </p>
      </header>

      <section className="editorial-section">
        <h2 className="editorial-heading">Purpose & Fields</h2>
        <div className="editorial-body">
          <p>
            Persian Scholarly Transliterator is built to serve scholars, cataloguers, and editors who require high-fidelity, transparent transliteration according to the standards of the <em>International Journal of Middle East Studies</em> (IJMES).
          </p>
          <p>Key application areas include:</p>
          <ul>
            <li><strong>Digital Humanities:</strong> Text processing, corpus normalization, and metadata pipelines.</li>
            <li><strong>Iranian & Middle Eastern Studies:</strong> Article titles, quotations, proper names, and bibliographic entries.</li>
            <li><strong>Islamic Studies:</strong> Multilingual Arabic-Persian texts with shared orthography.</li>
            <li><strong>Bibliography & Cataloguing:</strong> Standardized RIS and BibTeX record generation with diacritic preservation.</li>
            <li><strong>Scholarly Editing:</strong> Critical editions with verifiable editorial decision provenance.</li>
          </ul>
        </div>
      </section>

      <section className="editorial-section">
        <h2 className="editorial-heading">Author & Attribution</h2>
        <div className="editorial-body">
          <p>
            <strong>Created by:</strong> Mahdi Mirabian Tabar
          </p>
          <p>
            <strong>Copyright:</strong> © 2026 Mahdi Mirabian Tabar
          </p>
          <p>
            This project is open research software designed to provide a transparent, audit-ready foundation for Persian transliteration.
          </p>
        </div>
      </section>

      <section className="editorial-section">
        <h2 className="editorial-heading">Source Code & Contribution</h2>
        <div className="editorial-body">
          <p>
            The project source code, benchmark suites, and validation tooling are hosted publicly on GitHub:
          </p>
          <p>
            <a
              href="https://github.com/mehdimt1980/persian-scholarly-transliterator"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-github-link"
              style={{ fontSize: '16px' }}
              aria-label="GitHub repository mehdimt1980/persian-scholarly-transliterator (opens in new tab)"
            >
              GitHub Repository
              <span className="footer-repo" style={{ fontSize: '13px' }}>
                mehdimt1980/persian-scholarly-transliterator
              </span>
            </a>
          </p>
        </div>
      </section>
    </article>
  );
}
