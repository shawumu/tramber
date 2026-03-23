// packages/provider/src/registry.ts
/**
 * AI Provider Registry - Provider 注册表
 */

import type { AIProvider, ChatOptions, ChatResponse } from './types.js';

export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private defaultProvider?: string;

  register(name: string, provider: AIProvider): void {
    this.providers.set(name, provider);
  }

  unregister(name: string): void {
    this.providers.delete(name);
    if (this.defaultProvider === name) {
      this.defaultProvider = undefined;
    }
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not found`);
    }
    this.defaultProvider = name;
  }

  async chat(options: ChatOptions, providerName?: string): Promise<ChatResponse> {
    const name = providerName || this.defaultProvider;
    if (!name) {
      throw new Error('No provider specified and no default provider set');
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }

    return provider.chat(options);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
