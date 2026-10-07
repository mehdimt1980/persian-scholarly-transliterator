import rawPack from './generated/kaikki-fallback.v1.json';
import { EvidenceFallbackRepository } from '../domain/evidence/kaikki/fallback/repository';
import type { EvidenceFallbackPack } from '../domain/evidence/kaikki/fallback/types';

export const DEFAULT_EVIDENCE_FALLBACK_REPOSITORY = new EvidenceFallbackRepository(
  rawPack as unknown as EvidenceFallbackPack
);
