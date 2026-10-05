import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/app/components/PhraseAssistantPanel.tsx';
let source = readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Non-unique patch anchor: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  'cancel-edit helper',
  `  function rejectResolution() {\n    setResolution(null);\n    setCanonicalDraft('');\n    setRenderedDraft('');\n    setEditing(false);\n    setError(null);\n    setStatus('rejected');\n    lastAutomaticAttempt.current = requestKey;\n    onAcceptedDecision(null);\n  }`,
  `  function rejectResolution() {\n    setResolution(null);\n    setCanonicalDraft('');\n    setRenderedDraft('');\n    setEditing(false);\n    setError(null);\n    setStatus('rejected');\n    lastAutomaticAttempt.current = requestKey;\n    onAcceptedDecision(null);\n  }\n\n  function toggleEditing() {\n    if (editing) {\n      setCanonicalDraft(resolution?.scholarlyCanonical ?? '');\n      setRenderedDraft(resolution?.renderedOutput ?? '');\n      setEditing(false);\n      return;\n    }\n    setEditing(true);\n  }`
);

replaceOnce(
  'indexed token reading key',
  '<div key={reading.surface} className={styles.tokenChip}>',
  '<div key={`${reading.tokenIndex}:${reading.surface}`} className={styles.tokenChip}>'
);

replaceOnce(
  'cancel edit button',
  `<button className={styles.secondaryButton} onClick={() => setEditing((value) => !value)}>\n              {editing ? 'Cancel edit' : 'Edit before accepting'}\n            </button>`,
  `<button className={styles.secondaryButton} onClick={toggleEditing}>\n              {editing ? 'Cancel edit' : 'Edit before accepting'}\n            </button>`
);

writeFileSync(path, source);
console.log('Phrase assistant panel hardening applied.');
