import React from 'react';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-meta">
          <div className="footer-title">Persian Scholarly Transliterator</div>
          <div className="footer-copyright">© 2026 Mahdi Mirabian Tabar</div>
          <p className="footer-desc">Research software for Persian scholarly transliteration.</p>
        </div>
        <div className="footer-links">
          <div className="footer-link-group">
            <span className="footer-heading">Source Code</span>
            <a
              href="https://github.com/mehdimt1980/persian-scholarly-transliterator"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-github-link"
              aria-label="GitHub repository mehdimt1980/persian-scholarly-transliterator (opens in new tab)"
            >
              GitHub
              <span className="footer-repo">mehdimt1980/persian-scholarly-transliterator</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
