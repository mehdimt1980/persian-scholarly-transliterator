import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/app/page.tsx';
let source = readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  'component import',
  "import { useMemo, useState } from 'react';\n",
  "import { useMemo, useState } from 'react';\nimport PhraseAssistantPanel from './components/PhraseAssistantPanel';\n"
);

replaceOnce(
  'assistance imports',
  `import {\n  AssistedCandidate,\n  AssistedResolution,\n  buildResolverRequest,\n  candidateToReviewDecision,\n  computeRequestFingerprint\n} from '../domain/assistance';`,
  `import {\n  AcceptedPhraseDecision,\n  AssistedCandidate,\n  AssistedResolution,\n  buildResolverRequest,\n  candidateToReviewDecision,\n  checkAcceptedPhraseApplicability,\n  computeRequestFingerprint\n} from '../domain/assistance';`
);

replaceOnce(
  'single state',
  `  const [copied, setCopied] = useState(false);\n\n  const result = useMemo(() => transliterate(input, profile, decisions), [input, profile, decisions]);`,
  `  const [copied, setCopied] = useState(false);\n  const [acceptedPhraseDecision, setAcceptedPhraseDecision] = useState<AcceptedPhraseDecision | null>(null);\n\n  const result = useMemo(() => transliterate(input, profile, decisions), [input, profile, decisions]);\n  const activePhraseDecision = acceptedPhraseDecision && checkAcceptedPhraseApplicability(acceptedPhraseDecision, result).applicable\n    ? acceptedPhraseDecision\n    : null;\n  const selectedOutput = activePhraseDecision?.renderedOutput ?? result.output;\n  const selectedCopyable = Boolean(activePhraseDecision) || result.copyable;\n  const selectedStatus = activePhraseDecision ? 'USER_OVERRIDE' : result.status;`
);

replaceOnce(
  'clear all decisions',
  `  function clearAllDecisions() {\n    setDecisions([]);\n    setManualInputs({});\n    setManualErrors({});\n  }`,
  `  function clearAllDecisions() {\n    setDecisions([]);\n    setManualInputs({});\n    setManualErrors({});\n    setAcceptedPhraseDecision(null);\n  }`
);

replaceOnce(
  'copy selected output',
  `  async function copy() {\n    if (!result.copyable) return;\n    await navigator.clipboard.writeText(result.output);\n    setCopied(true);\n    setTimeout(() => setCopied(false), 1400);\n  }`,
  `  async function copy() {\n    if (!selectedCopyable) return;\n    await navigator.clipboard.writeText(selectedOutput);\n    setCopied(true);\n    setTimeout(() => setCopied(false), 1400);\n  }`
);

replaceOnce(
  'output panel',
  `              <div className="panel-top">\n                <label>Selected transliteration</label>\n                <span className={\`status \${result.status.toLowerCase()}\`}>{result.status}</span>\n              </div>\n              <div className="output">\n                {result.output || <span className="muted">Output appears here</span>}\n              </div>\n              {!result.copyable && (\n                <p className="review-notice">\n                  Human review required. Ambiguous or unresolved material is intentionally not copyable as final transliteration.\n                </p>\n              )}\n              <div className="output-actions">\n                <span className="profile">\n                  {profile === 'ijmes_title' ? 'IJMES · title presentation' : 'IJMES · full scholarly'}\n                </span>\n                <button onClick={copy} disabled={!result.copyable}>\n                  {copied ? 'Copied' : result.copyable ? 'Copy output' : 'Review required'}\n                </button>\n              </div>`,
  `              <div className="panel-top">\n                <label>Selected transliteration</label>\n                <span className={\`status \${selectedStatus.toLowerCase()}\`}>{selectedStatus}</span>\n              </div>\n              <div className="output">\n                {selectedOutput || <span className="muted">Output appears here</span>}\n              </div>\n              {activePhraseDecision ? (\n                <p className="review-notice" style={{ color: 'var(--sage)' }}>\n                  AI-assisted phrase proposal accepted by the user. The deterministic unresolved state remains visible below for audit and can be restored by revoking the phrase decision.\n                </p>\n              ) : !result.copyable ? (\n                <p className="review-notice">\n                  Human review required. Ambiguous or unresolved material is intentionally not copyable as final transliteration.\n                </p>\n              ) : null}\n              <div className="output-actions">\n                <span className="profile">\n                  {profile === 'ijmes_title' ? 'IJMES · title presentation' : 'IJMES · full scholarly'}\n                </span>\n                <button onClick={copy} disabled={!selectedCopyable}>\n                  {copied ? 'Copied' : selectedCopyable ? 'Copy output' : 'Review required'}\n                </button>\n              </div>`
);

replaceOnce(
  'phrase panel insertion',
  `          </section>\n\n          {/* Single Review Workspace: Visible when issues exist OR active decisions can be reviewed/undone */}`,
  `          </section>\n\n          {(!result.copyable || activePhraseDecision) && (\n            <PhraseAssistantPanel\n              result={result}\n              reviewDecisions={decisions}\n              acceptedDecision={acceptedPhraseDecision}\n              onAcceptedDecision={setAcceptedPhraseDecision}\n            />\n          )}\n\n          {/* Single Review Workspace: Visible when issues exist OR active decisions can be reviewed/undone */}`
);

writeFileSync(path, source);
console.log('Phrase assistant page integration applied successfully.');
