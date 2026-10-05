import type {
  PhraseResolution,
  PhraseResolverRequest,
  RawPhraseResolutionPayload
} from '../../domain/assistance';
import { validatePhraseProviderResolution } from '../../domain/assistance';

export interface PhraseResolverProvider {
  readonly providerName: string;
  readonly modelName: string;
  resolve(
    request: PhraseResolverRequest,
    signal?: AbortSignal
  ): Promise<PhraseResolution>;
}

export class FakePhraseResolverProvider implements PhraseResolverProvider {
  public readonly providerName: string;
  public readonly modelName: string;
  private readonly handler: (request: PhraseResolverRequest) => RawPhraseResolutionPayload;

  constructor(
    handler: (request: PhraseResolverRequest) => RawPhraseResolutionPayload,
    providerName = 'fake-provider',
    modelName = 'fake-phrase-model-v1'
  ) {
    this.handler = handler;
    this.providerName = providerName;
    this.modelName = modelName;
  }

  public async resolve(
    request: PhraseResolverRequest,
    signal?: AbortSignal
  ): Promise<PhraseResolution> {
    if (signal?.aborted) {
      throw new Error('Phrase assistance request was aborted.');
    }

    const validation = validatePhraseProviderResolution(
      this.handler(request),
      request,
      this.providerName,
      this.modelName
    );

    if (!validation.valid || !validation.resolution) {
      throw new Error(`Phrase provider response validation failed: ${validation.errors.join('; ')}`);
    }

    return validation.resolution;
  }
}
