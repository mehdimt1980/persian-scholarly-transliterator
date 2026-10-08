'use client';

import type { AiExplanation } from '../../domain/assistance';
import styles from './TokenReadingEditor.module.css';

interface TokenReadingEditorProps {
  explanation: AiExplanation;
  tokenEdits: Record<number, string>;
  editedCanonical: string;
  editedRendered: string;
  unlocatedTokens: number[];
  alignmentWarning: string | null;
  canAccept: boolean;
  profileLabel: string;
  error: string | null;
  onEditToken: (tokenIndex: number, value: string) => void;
  onEditPhrase: (value: string) => void;
  onReset: () => void;
  onAccept: () => void;
  onClose: () => void;
}

/**
 * Focused token-by-token editor. Rendering is recomputed upstream with the existing
 * profile formatter; tokens with deterministic canonical evidence are read-only.
 */
export default function TokenReadingEditor({
  explanation,
  tokenEdits,
  editedCanonical,
  editedRendered,
  unlocatedTokens,
  alignmentWarning,
  canAccept,
  profileLabel,
  error,
  onEditToken,
  onEditPhrase,
  onReset,
  onAccept,
  onClose
}: TokenReadingEditorProps) {
  return (
    <section className={styles.editor} aria-label="Token reading editor" id="token-reading-editor">
      <div className={styles.header}>
        <strong>Review &amp; Edit · token by token</strong>
        <span className={styles.hint}>Edits stay provisional until you accept them.</span>
      </div>

      <div className={styles.rows}>
        {explanation.tokens.map((row) => {
          const edited = tokenEdits[row.tokenIndex];
          const value = edited ?? row.proposedReading;
          return (
            <div key={row.tokenIndex} className={styles.row} data-token-index={row.tokenIndex}>
              <bdi dir="rtl" className={styles.source}>{row.surface}</bdi>
              <div className={styles.fields}>
                <span className={styles.meta}>
                  Proposed: <strong>{row.proposedReading}</strong> · {row.deterministicStatus.replaceAll('_', ' ').toLowerCase()}
                  {row.locked ? ' · deterministic reading (locked)' : ' · AI-proposed'}
                  {row.lexicalSources.length > 0 ? ` · ${row.lexicalSources.join(', ')}` : ''}
                </span>
                <input
                  className={styles.input}
                  aria-label={`Reading for ${row.surface}`}
                  value={value}
                  readOnly={row.locked}
                  onChange={(event) => onEditToken(row.tokenIndex, event.target.value)}
                />
                {row.alternatives.length > 0 && !row.locked && (
                  <div className={styles.alts}>
                    {row.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        className={styles.altButton}
                        onClick={() => onEditToken(row.tokenIndex, alt)}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.phrase}>
        <label htmlFor="editor-phrase-canonical" className={styles.meta}>Full phrase canonical (advanced)</label>
        <input
          id="editor-phrase-canonical"
          className={styles.input}
          value={editedCanonical}
          onChange={(event) => onEditPhrase(event.target.value)}
        />
        <span className={styles.meta}>{profileLabel}: <strong>{editedRendered || '—'}</strong></span>
        {alignmentWarning && (
          <span className={styles.warn} role="alert">{alignmentWarning}</span>
        )}
        {unlocatedTokens.length > 0 && (
          <span className={styles.warn}>
            {unlocatedTokens.length} requested token edit{unlocatedTokens.length === 1 ? '' : 's'} remain unapplied; edit the full phrase instead.
          </span>
        )}
        {error && <span className={styles.warn}>{error}</span>}
      </div>

      <div className={styles.actions}>
        <button type="button" className="btn-primary" onClick={onAccept} disabled={!canAccept}>Accept edited reading</button>
        <button type="button" className="btn-secondary" onClick={onReset}>Reset edits</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
