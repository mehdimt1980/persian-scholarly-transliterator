'use client';
import { useMemo, useState } from 'react';
import { transliterate } from '../domain/engine';
import { ProfileId } from '../domain/types';

const fixture = 'تأملی درباره ایران: مکتب تبریز و مبانی تجددخواهی';

export default function Home() {
  const [input, setInput] = useState(fixture);
  const [profile, setProfile] = useState<ProfileId>('ijmes_title');
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => transliterate(input, profile), [input, profile]);
  async function copy() { if (!result.copyable) return; await navigator.clipboard.writeText(result.output); setCopied(true); setTimeout(() => setCopied(false), 1400); }
  return <main>
    <header><p className="eyebrow">SCHOLARLY LANGUAGE TOOLS · FOUNDATION</p><h1>Persian <em>→</em> transliteration</h1><p className="lede">A transparent IJMES workflow for academic Persian, designed to show where the source is certain—and where it is not.</p></header>
    <section className="workspace">
      <div className="panel input-panel"><div className="panel-top"><label htmlFor="source">Persian source</label><span>RTL · Unicode safe</span></div><textarea id="source" dir="rtl" value={input} onChange={event => setInput(event.target.value)} /><div className="controls"><label>Context<select value={profile} onChange={event => setProfile(event.target.value as ProfileId)}><option value="ijmes_title">Book / article title</option><option value="ijmes_full">Full scholarly / technical term</option></select></label></div></div>
      <div className="panel output-panel"><div className="panel-top"><label>Selected transliteration</label><span className="status">{result.status}</span></div><div className="output">{result.output || <span className="muted">Output appears here</span>}</div>{!result.copyable && <p className="review-notice">Human review required. Ambiguous or unresolved material is intentionally not copyable as final transliteration.</p>}<div className="output-actions"><span className="profile">{profile === 'ijmes_title' ? 'IJMES · title presentation' : 'IJMES · full scholarly'}</span><button onClick={copy} disabled={!result.copyable}>{copied ? 'Copied' : result.copyable ? 'Copy output' : 'Review required'}</button></div></div>
    </section>
    <section className="inspection"><div className="section-heading"><div><p className="eyebrow">INSPECTION</p><h2>Token-level evidence</h2></div><p>Every reading carries status, confidence, and truthful rule provenance.</p></div><div className="token-list">{result.tokens.filter(token => token.source.trim()).map((token, index) => <article className="token" key={`${token.start}-${index}`}><div className="token-line"><span className="source" dir="rtl">{token.source}</span><span className="arrow">→</span><span>{token.rendered}</span><span className={`badge ${token.status.toLowerCase()}`}>{token.status}</span></div><div className="token-meta">{token.confidence !== undefined && <span>confidence {Math.round(token.confidence * 100)}%</span>}{token.diagnosticScaffold && <span>diagnostic only: {token.diagnosticScaffold}</span>}{token.alternatives.length > 0 && <span>alternatives: {token.alternatives.join(' · ')}</span>}{token.appliedRules.length > 0 && <span>{token.appliedRules.map(rule => rule.id).join(' · ')}</span>}{token.warnings.map(warning => <span className="warning" key={warning}>{warning}</span>)}</div></article>)}</div></section>
    <footer><span>Not an official IJMES / Cambridge product.</span><span>Source-grounded · Reviewable · Unicode</span></footer>
  </main>;
}
