// packages/provider/src/factory.ts
/**
 * Provider Factory - 创建 Provider 实例
 */

import { AnthropicProvider } from './anthropic/client.js';
import { OpenAIProvider } from './openai/client.js';
import { GeminiProvider } from './gemini/client.js';
import type { AIProvider, ProviderConfig } from './types.js';
import type { ProviderRegistry } from './registry.js';

export interface ProviderFactory {
  create(config: ProviderConfig): AIProvider;
  createAndRegister(config: ProviderConfig, name: string, registry: ProviderRegistry): void;
}

export class DefaultProviderFactory implements ProviderFactory {
  create(config: ProviderConfig): AIProvider {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicProvider({
          apiKey: config.apiKey,
          model: config.model,
          baseURL: config.baseURL
        });

      case 'openai':
        return new OpenAIProvider({
          apiKey: config.apiKey,
          model: config.model,
          baseURL: config.baseURL
        });

      case 'gemini':
        return new GeminiProvider({
          apiKey: config.apiKey,
          model: config.model
        });

      case 'custom':
        throw new Error('Custom provider not implemented yet');

      default:
        throw new Error(`Unknown provider type: ${(config as ProviderConfig).type}`);
    }
  }

  createAndRegister(config: ProviderConfig, name: string, registry: ProviderRegistry): void {
    const provider = this.create(config);
    registry.register(name, provider);
  }
}

export const providerFactory = new DefaultProviderFactory();
