import { loadConfig } from '../config/loader.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import type { LLMProvider } from './types.js';

export * from './types.js';

let providerInstance: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const config = loadConfig();

  switch (config.llm.provider) {
    case 'anthropic':
      providerInstance = new AnthropicProvider();
      break;
    case 'ollama':
      providerInstance = new OllamaProvider();
      break;
    case 'openai':
      providerInstance = new OpenAIProvider();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
  }

  return providerInstance;
}

export function resetProvider(): void {
  providerInstance = null;
}
