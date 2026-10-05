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
  'request decision fingerprint',
  `      reviewDecisions.map((decision) => \`${'${decision.issueId}'}:${'${decision.action}'}\`).sort().join(',')`,
  `      reviewDecisions.map((decision) => [\n        decision.issueId,\n        decision.action,\n        decision.selectedAlternativeId ?? '',\n        decision.manualCanonicalTransliteration ?? '',\n        decision.note ?? ''\n      ].join(':')).sort().join(',')`
);

replaceOnce(
  'sanitized review decisions payload',
  `          reviewDecisions\n        })`,
  `          reviewDecisions: reviewDecisions.map((decision) => ({\n            issueId: decision.issueId,\n            action: decision.action,\n            selectedAlternativeId: decision.selectedAlternativeId,\n            manualCanonicalTransliteration: decision.manualCanonicalTransliteration,\n            note: decision.note\n          }))\n        })`
);

writeFileSync(path, source);
console.log('Phrase review-decision sanitization applied.');
