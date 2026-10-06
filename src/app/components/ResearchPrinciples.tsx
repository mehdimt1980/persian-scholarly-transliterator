import React from 'react';

export default function ResearchPrinciples() {
  return (
    <section className="principles-section" aria-labelledby="principles-heading">
      <h2 id="principles-heading" className="principles-heading">Core Scholarly Principles</h2>
      <div className="principles-grid">
        <div className="principle-card">
          <div className="principle-num">01</div>
          <h3 className="principle-title">Deterministic</h3>
          <p className="principle-text">
            The same input and scholarly decisions produce the same result. Rules operate transparently without stochastic variance.
          </p>
        </div>
        <div className="principle-card">
          <div className="principle-num">02</div>
          <h3 className="principle-title">Evidence-Aware</h3>
          <p className="principle-text">
            External scholarly records can inform interpretation without becoming authority automatically. Observations remain distinct from authoritative readings.
          </p>
        </div>
        <div className="principle-card">
          <div className="principle-num">03</div>
          <h3 className="principle-title">Human-Governed</h3>
          <p className="principle-text">
            Ambiguous readings and reusable lexical authority remain under explicit human control. The system refuses to silently guess uncertain readings.
          </p>
        </div>
      </div>
    </section>
  );
}
