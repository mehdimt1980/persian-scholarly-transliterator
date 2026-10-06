import React from 'react';

export const metadata = {
  title: 'Methodology & Authority Architecture — Persian Scholarly Transliterator',
  description:
    'Explaining deterministic IJMES transliteration, ambiguity detection, external evidence integration, and human-governed lexical authority.'
};

export default function MethodPage() {
  return (
    <article className="editorial-article">
      <header className="page-intro">
        <span className="page-intro-eyebrow">Architecture & Method</span>
        <h1 className="page-title">Methodology & Authority Model</h1>
        <p className="page-tagline">
          How deterministic rules, external cataloguing evidence, and human governance interact in Persian scholarly transliteration.
        </p>
      </header>

      {/* Visual Flow Diagram */}
      <section className="flow-diagram-box" aria-label="Methodological Architecture Flow">
        <div className="flow-steps">
          <div className="flow-node">Persian source text</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node">Deterministic rule engine</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node">Ambiguity detection</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node">External evidence observation</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node">Scheme-aware interpretation</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node human-node">Human review & adjudication</div>
          <div className="flow-down-arrow" aria-hidden="true">↓</div>
          <div className="flow-node authority-node">Reviewed lexical authority</div>
        </div>
      </section>

      {/* Section 1: Deterministic transliteration */}
      <section className="editorial-section">
        <h2 className="editorial-heading">Deterministic transliteration & citation presentation</h2>
        <div className="editorial-body">
          <p>
            The transliterator is designed around reproducibility: the <strong>exact same scholarly input and review decisions always produce the exact same transliterated output</strong>.
          </p>
          <p>
            The project uses IJMES-compatible Persian transliteration conventions for scholarly canonical forms. Normalization handles zero-width non-joiners (ZWNJ), explicit diacritics, and Persian orthographic variations without destructive side effects.
          </p>
          <p>
            For bibliographic book/article titles, the application uses a <strong>scholarly citation-title presentation profile</strong> (<code>ijmes_citation_title</code>) that <strong>preserves full scholarly diacritics</strong> (e.g. <em>ā, ī, ū, ḥ, ṣ, ṭ, ẓ, ż, ʿ, ʾ</em>) and applies citation-title capitalization (e.g., <em>Zavāl-i Andīshah-i Siyāsī Dar Īrān</em>). This is intentionally distinct from the publication house style of the journal <em>IJMES</em>, ensuring full fidelity for bibliographies, dissertations, and research databases.
          </p>
        </div>
      </section>

      {/* Section 2: Ambiguity detection */}
      <section className="editorial-section">
        <h2 className="editorial-heading">Explicit ambiguity detection</h2>
        <div className="editorial-body">
          <p>
            Many Persian orthographic strings admit multiple valid scholarly readings depending on context, morphology, or etymology (such as <em>kirm</em> vs. <em>karam</em> vs. <em>kram</em> for <bdi dir="rtl">کرم</bdi>, or uncertain izāfat relations).
          </p>
          <p>
            Rather than silently forcing an arbitrary guess, the engine <strong>holds ambiguous tokens for human review</strong>. Output containing unresolved ambiguity is clearly marked and disabled from canonical copy until reviewed.
          </p>
        </div>
      </section>

      {/* Section 3: External evidence */}
      <section className="editorial-section">
        <h2 className="editorial-heading">External evidence integration</h2>
        <div className="editorial-body">
          <p>
            Scholarly cataloguing systems and bibliographies contain high-quality historical observations. External records can contribute evidence to help disambiguate complex terms.
          </p>
          <p>
            The current implemented external-source pilot connects to <strong>Library of Congress</strong> authority data. Observations are recorded with source provenance, original scheme tags, and exact timestamps.
          </p>
        </div>
      </section>

      {/* Section 4: Scheme-aware interpretation */}
      <section className="editorial-section">
        <h2 className="editorial-heading">Scheme-aware interpretation</h2>
        <div className="editorial-body">
          <p>
            External authorities often use transliteration schemes other than IJMES, such as ALA-LC. The architecture implements deterministic scheme converters (for example, mapping ALA-LC modifier letter turned comma <code>ʻ</code> to IJMES ayn <code>ʿ</code>).
          </p>
          <p>
            Converted forms are treated as <em>interpretive hypotheses</em>, not automatically authoritative conclusions.
          </p>
        </div>
      </section>

      {/* Section 5: Illustrative Sa'dī Example */}
      <section className="example-card-illustrative" aria-label="Illustrative Evidence Workflow">
        <span className="illustrative-badge">Illustrative evidence workflow</span>
        <div className="example-grid">
          <div className="example-item">
            <span className="example-item-label">Persian source</span>
            <span className="example-item-val" dir="rtl" style={{ fontSize: '20px', fontFamily: 'var(--font-serif)' }}>سعدی</span>
          </div>
          <div className="example-item">
            <span className="example-item-label">External observation</span>
            <span className="example-item-val">Saʻdī</span>
            <span className="example-item-sub">Library of Congress · ALA-LC</span>
          </div>
          <div className="example-item">
            <span className="example-item-label">Scheme interpretation</span>
            <span className="example-item-val">saʿdī</span>
            <span className="example-item-sub">IJMES hypothesis</span>
          </div>
          <div className="example-item">
            <span className="example-item-label">Conversion rule</span>
            <span className="example-item-val" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>ALA-LC ʻ → IJMES ʿ</span>
          </div>
          <div className="example-item">
            <span className="example-item-label">Authority status</span>
            <span className="example-item-val" style={{ color: 'var(--status-review-text)', fontSize: '13px' }}>
              Non-authoritative until explicit human review & promotion
            </span>
          </div>
        </div>
      </section>

      {/* Section 6: Human authority & Explicit promotion */}
      <section className="editorial-section">
        <h2 className="editorial-heading">Human authority and explicit promotion</h2>
        <div className="editorial-body">
          <p>
            Machine agreement and external observations never create reusable lexical authority on their own. Authority is strictly governed:
          </p>
          <ul>
            <li>
              <strong>Explicit human adjudication:</strong> A scholar must review the evidence and approve the canonical form.
            </li>
            <li>
              <strong>Immutability receipts:</strong> Every promotion into the core lexicon generates an immutable cryptographically fingerprinted receipt.
            </li>
            <li>
              <strong>Auditability:</strong> Downstream consumers can trace any canonical reading back to its underlying rule or human decision receipt.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 7: Workspace Persistence */}
      <section className="editorial-section">
        <h2 className="editorial-heading">Workspace persistence & research privacy</h2>
        <div className="editorial-body">
          <p>
            Current work in the single transliteration and bibliography workspaces is stored locally in this browser using IndexedDB so you can move between sections or return later without losing your research state.
          </p>
          <p>
            No user account, cloud synchronization, or server-side database is used for persistence. Assistant requests are transmitted only when you explicitly invoke assistance.
          </p>
        </div>
      </section>

      {/* Future-Facing Note */}
      <div className="future-note">
        <strong>Implementation Note:</strong> Current evidence integration is intentionally conservative. The implemented external-source pilot uses Library of Congress records. Multi-source authority expansion is planned separately.
      </div>
    </article>
  );
}
