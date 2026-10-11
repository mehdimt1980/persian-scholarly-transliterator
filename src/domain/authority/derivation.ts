import { createHash } from 'node:crypto';
import { normalizePersian } from '../normalization';
import type { DerivationType } from './types';

export function computeDerivedCandidateId(
  parentCandidateId: string,
  runningTextPersianSurface: string,
  derivationType: DerivationType
): string {
  const norm = normalizePersian(runningTextPersianSurface).normalizedInput;
  const hash = createHash('sha256')
    .update([parentCandidateId, norm, derivationType].join(':'))
    .digest('hex');
  return `der-${hash.slice(0, 20)}`;
}
