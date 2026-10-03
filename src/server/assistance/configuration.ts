export interface AssistedResolverConfig {
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

export function getAssistedResolverConfig(): AssistedResolverConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.ASSISTED_RESOLVER_MODEL || 'gpt-4o-mini';
  const timeoutMs = parseInt(process.env.ASSISTED_RESOLVER_TIMEOUT_MS || '15000', 10);

  return {
    apiKey: apiKey && apiKey.trim() !== '' ? apiKey.trim() : undefined,
    model: model.trim(),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000
  };
}

export function isOpenAiConfigured(): boolean {
  const config = getAssistedResolverConfig();
  return Boolean(config.apiKey);
}
