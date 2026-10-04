import { ExternalCorpusCandidate, OverlapAuditResult } from './types';

function escapeCsv(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateReviewSheetCsv(
  candidates: ExternalCorpusCandidate[],
  overlapAudit?: OverlapAuditResult
): string {
  const headers = [
    'id',
    'sourceText',
    'category',
    'proposedProfile',
    'sourceCitations',
    'sourceUrls',
    'observedRomanizations',
    'romanizationSystems',
    'acquisitionNotes',
    'projectOverlapStatus',
    'reviewDecision',
    'reviewedIjmesCanonical',
    'reviewNotes',
    'reviewer',
    'reviewedAt'
  ];

  const lexiconOverlapSet = new Set(
    overlapAudit?.lexiconOverlapCandidates.map((c) => c.id) ?? []
  );

  const rows: string[] = [headers.join(',')];

  const validCandidates = candidates.filter((c) => {
    if (c.reviewStatus !== 'PENDING_HUMAN_REVIEW') return false;
    if (c.independenceClass === 'REJECT_CIRCULAR') return false;
    const hasVerifiedSource = c.sources?.some((s) => s.verification?.status === 'VERIFIED');
    return hasVerifiedSource;
  });

  for (const c of validCandidates) {
    const citations = c.sources
      .map((s) => s.citation || s.title)
      .filter(Boolean)
      .join(' | ');

    const urls = c.sources
      .map((s) => s.url)
      .filter(Boolean)
      .join(' | ');

    const obsRoms = c.sources
      .map((s) => s.observedRomanization)
      .filter(Boolean)
      .join(' | ');

    const romSys = c.sources
      .map((s) => s.romanizationSystem)
      .filter(Boolean)
      .join(' | ');

    const overlapStatus = lexiconOverlapSet.has(c.id) ? 'LEXICON_OVERLAP' : 'OUT_OF_SAMPLE';

    const row = [
      escapeCsv(c.id),
      escapeCsv(c.sourceText),
      escapeCsv(c.category),
      escapeCsv(c.proposedProfile),
      escapeCsv(citations),
      escapeCsv(urls),
      escapeCsv(obsRoms),
      escapeCsv(romSys),
      escapeCsv(c.acquisitionNotes || ''),
      escapeCsv(overlapStatus),
      // 5 Review fields initially BLANK
      '',
      '',
      '',
      '',
      ''
    ];

    rows.push(row.join(','));
  }

  return rows.join('\n');
}
