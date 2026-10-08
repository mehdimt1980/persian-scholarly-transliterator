import rawPack from './generated/kaikki-fallback.v1.json';
import { EvidenceFallbackRepository } from '../domain/evidence/kaikki/fallback/repository';
import type { EvidenceFallbackPack } from '../domain/evidence/kaikki/fallback/types';

export const EMPTY_EVIDENCE_FALLBACK_REPOSITORY = new EvidenceFallbackRepository();

export const DEFAULT_EVIDENCE_FALLBACK_PACK = rawPack as unknown as EvidenceFallbackPack;

export const DEFAULT_EVIDENCE_FALLBACK_REPOSITORY = new EvidenceFallbackRepository(
  DEFAULT_EVIDENCE_FALLBACK_PACK
);

