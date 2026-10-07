import { appConfig } from '@/config/app.config';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { requireRuntimeEnv } from '@/lib/runtime-config';

type ProviderName = 'openai' | 'anthropic' | 'groq' | 'google';

// Client function type returned by @ai-sdk providers
export type ProviderClient =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGroq>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderResolution {
  client: ProviderClient;
  actualModel: string;
  provider: ProviderName;
}

const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

// Cache provider clients by a stable key to avoid recreating
const clientCache = new Map<string, ProviderClient>();

function getEnvDefaults(provider: ProviderName): { apiKey?: string; baseURL?: string } {
  switch (provider) {
    case 'openai':
      return { apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL };
    case 'anthropic':
      // Default Anthropic base URL mirrors existing routes
      return { apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
    case 'groq':
      return { apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL };
    case 'google':
      return { apiKey: process.env.GEMINI_API_KEY, baseURL: process.env.GEMINI_BASE_URL };
    default:
      return {};
  }
}

function getOrCreateClient(provider: ProviderName, apiKey?: string, baseURL?: string): ProviderClient {
  const aiGatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const defaults = getEnvDefaults(provider);
  const variableNames: Record<ProviderName, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    google: 'GEMINI_API_KEY'
  };
  const effective = aiGatewayApiKey
    ? { apiKey: aiGatewayApiKey, baseURL: aiGatewayBaseURL }
    : {
        apiKey: apiKey?.trim() || defaults.apiKey?.trim() || requireRuntimeEnv(variableNames[provider]),
        baseURL: baseURL ?? defaults.baseURL
      };

  const cacheKey = `${provider}:${effective.apiKey || ''}:${effective.baseURL || ''}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  let client: ProviderClient;
  switch (provider) {
    case 'openai':
      client = createOpenAI(effective);
      break;
    case 'anthropic':
      client = createAnthropic(effective);
      break;
    case 'groq':
      client = createGroq(effective);
      break;
    case 'google':
      client = createGoogleGenerativeAI(effective);
      break;
    default:
      client = createGroq(effective);
  }

  clientCache.set(cacheKey, client);
  return client;
}

export function getProviderForModel(modelId: string): ProviderResolution {
  // 1) Check explicit model configuration in app config (custom models)
  const configured = appConfig.ai.modelApiConfig?.[modelId as keyof typeof appConfig.ai.modelApiConfig];
  if (configured) {
    const { provider, apiKey, baseURL, model } = configured as { provider: ProviderName; apiKey?: string; baseURL?: string; model: string };
    const client = getOrCreateClient(provider, apiKey, baseURL);
    return { client, actualModel: model, provider };
  }

  // 2) Fallback logic based on prefixes and special cases
  const isAnthropic = modelId.startsWith('anthropic/');
  const isOpenAI = modelId.startsWith('openai/');
  const isGoogle = modelId.startsWith('google/');
  if (isAnthropic) {
    const client = getOrCreateClient('anthropic');
    return { client, actualModel: modelId.replace('anthropic/', ''), provider: 'anthropic' };
  }

  if (isOpenAI) {
    const client = getOrCreateClient('openai');
    return { client, actualModel: modelId.replace('openai/', ''), provider: 'openai' };
  }

  if (isGoogle) {
    const client = getOrCreateClient('google');
    return { client, actualModel: modelId.replace('google/', ''), provider: 'google' };
  }

  // Default: use Groq with modelId as-is
  const client = getOrCreateClient('groq');
  return { client, actualModel: modelId.replace(/^groq\//, ''), provider: 'groq' };
}

export default getProviderForModel;


