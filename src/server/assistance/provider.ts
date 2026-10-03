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

    // Default mock behavior based on issue type and allowed actions
    const candidates: AssistedCandidateProposal[] = [];
    const warnings: string[] = [];

    if (
      (request.issueType === 'LEXICAL_AMBIGUITY' || request.issueType === 'INSUFFICIENT_VOCALIZATION') &&
      request.allowedActions.includes('SELECT_LEXICAL_READING')
    ) {
      request.availableAlternatives.forEach((alt, idx) => {
        candidates.push({
          kind: 'EXISTING_LEXICAL_READING',
          alternativeId: alt.id,
          canonical: alt.canonical,
          rank: idx + 1,
          modelConfidence: 0.9 - idx * 0.1,
          rationale: `Context favors ${alt.canonical ?? alt.label}.`,
          basis: 'CONTEXTUAL_INFERENCE',
          evidenceRefs: ['context:local-window']
        });
      });
    } else if (request.issueType === 'IZAFAT_CANDIDATE' && request.allowedActions.includes('ACCEPT_IZAFAT')) {
      candidates.push({
        kind: 'IZAFAT_DECISION',
        relationDecision: 'ACCEPT_IZAFAT',
        rank: 1,
        modelConfidence: 0.85,
        rationale: 'Nominal construct favors standard izāfat.',
        basis: 'MODEL_INFERENCE',
        evidenceRefs: []
      });
    } else if (request.issueType === 'MORPHOLOGY_AMBIGUITY' && request.allowedActions.includes('SELECT_MORPHOLOGY')) {
      const hasBranch = request.availableAlternatives.some((a) => a.id === 'PRODUCTIVE_SEGMENTATION');
      if (hasBranch) {
        candidates.push({
          kind: 'MORPHOLOGY_BRANCH',
          morphologyBranch: 'PRODUCTIVE_SEGMENTATION',
          rank: 1,
          modelConfidence: 0.8,
          rationale: 'Context indicates productive suffix attachment.',
          basis: 'MODEL_INFERENCE',
          evidenceRefs: []
        });
      }
    } else {
      // Do not fabricate invalid candidates for unknown tokens by default
      warnings.push('No automated suggestion available for this issue.');
    }

    const raw = {
      issueId: request.issueId,
      candidates,
      warnings
    };

    const validation = validateProviderResolution(raw, request, this.providerName, this.modelName);
    if (!validation.valid || !validation.resolution) {
      throw new Error(`Provider response validation failed: ${validation.errors.join('; ')}`);
    }

    return validation.resolution;
  }
}
