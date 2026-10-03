import {
  AssistedCandidateProposal,
  AssistedResolution,
  AssistedResolverRequest,
  validateProviderResolution
} from '../../domain/assistance';

export interface AssistedResolverProvider {
  readonly providerName: string;
  readonly modelName: string;
  resolve(
    request: AssistedResolverRequest,
    signal?: AbortSignal
  ): Promise<AssistedResolution>;
}

export class FakeAssistedResolverProvider implements AssistedResolverProvider {
  public readonly providerName: string;
  public readonly modelName: string;
  private customHandler?: (request: AssistedResolverRequest) => {
    issueId: string;
    candidates: AssistedCandidateProposal[];
    warnings?: string[];
  };

  constructor(
    providerName = 'fake-provider',
    modelName = 'fake-model-v1',
    customHandler?: (request: AssistedResolverRequest) => {
      issueId: string;
      candidates: AssistedCandidateProposal[];
      warnings?: string[];
    }
  ) {
    this.providerName = providerName;
    this.modelName = modelName;
    this.customHandler = customHandler;
  }

  public async resolve(
    request: AssistedResolverRequest,
    signal?: AbortSignal
  ): Promise<AssistedResolution> {
    if (signal?.aborted) {
      throw new Error('Assisted resolution request was aborted.');
    }

    if (this.customHandler) {
      const raw = this.customHandler(request);
      const validation = validateProviderResolution(raw, request, this.providerName, this.modelName);
      if (!validation.valid || !validation.resolution) {
        throw new Error(`Provider response validation failed: ${validation.errors.join('; ')}`);
      }
      return validation.resolution;
    }

    // Default mock behavior based on issue type
    const candidates: AssistedCandidateProposal[] = [];

    if (request.issueType === 'LEXICAL_AMBIGUITY') {
      request.availableAlternatives.forEach((alt, idx) => {
        candidates.push({
          kind: 'EXISTING_LEXICAL_READING',
          alternativeId: alt.id,
          canonical: alt.canonical,
          rank: idx + 1,
          modelConfidence: 0.9 - idx * 0.1,
          rationale: `Context favors ${alt.canonical ?? alt.label}.`,
          basis: 'CONTEXTUAL_INFERENCE',
          evidenceRefs: ['CONTEXTUAL_EVALUATION', alt.id]
        });
      });
    } else if (request.issueType === 'UNKNOWN_TOKEN') {
      candidates.push({
        kind: 'MANUAL_CANONICAL',
        canonical: request.normalizedSurface,
        rank: 1,
        modelConfidence: 0.8,
        rationale: 'Suggested canonical transliteration based on Persian morphology.',
        basis: 'MODEL_INFERENCE',
        evidenceRefs: ['PERSIAN_GRAMMAR']
      });
    } else if (request.issueType === 'IZAFAT_CANDIDATE') {
      candidates.push({
        kind: 'IZAFAT_DECISION',
        relationDecision: 'ACCEPT_IZAFAT',
        rank: 1,
        modelConfidence: 0.85,
        rationale: 'Nominal construct requires standard izāfat.',
        basis: 'CONTEXTUAL_INFERENCE',
        evidenceRefs: ['PERSIAN_GRAMMAR']
      });
    } else if (request.issueType === 'MORPHOLOGY_AMBIGUITY') {
      candidates.push({
        kind: 'MORPHOLOGY_BRANCH',
        morphologyBranch: 'PRODUCTIVE_SEGMENTATION',
        rank: 1,
        modelConfidence: 0.8,
        rationale: 'Context indicates productive suffix attachment.',
        basis: 'CONTEXTUAL_INFERENCE',
        evidenceRefs: ['PERSIAN_GRAMMAR']
      });
    }

    const raw = {
      issueId: request.issueId,
      candidates,
      warnings: []
    };

    const validation = validateProviderResolution(raw, request, this.providerName, this.modelName);
    if (!validation.valid || !validation.resolution) {
      throw new Error(`Provider response validation failed: ${validation.errors.join('; ')}`);
    }

    return validation.resolution;
  }
}
