import type { AIProvider } from './types';
import type { MockAIProvider } from './mockAiProvider';
import type { OpenAIProvider } from './openAiProvider';
import { AIError } from './types';

export type AIProviderType = 'mock' | 'openai';

export interface AIConfiguration {
  providerType: AIProviderType;
  cloudEnabled: boolean;
  openAiModel?: string;
}

export class AIConfigService {
  private config: AIConfiguration;

  constructor(initialConfig?: Partial<AIConfiguration>) {
    this.config = {
      providerType: 'mock',
      cloudEnabled: false,
      openAiModel: 'gpt-4o-mini',
      ...initialConfig,
    };
  }

  getConfig(): AIConfiguration {
    return { ...this.config };
  }

  setProviderType(providerType: AIProviderType): void {
    this.config.providerType = providerType;
  }

  setCloudEnabled(cloudEnabled: boolean): void {
    this.config.cloudEnabled = cloudEnabled;
  }

  setOpenAiModel(model: string): void {
    this.config.openAiModel = model;
  }
}

export class AIProviderSelector {
  private mockProvider: MockAIProvider;
  private openAiProvider: OpenAIProvider;
  private configService: AIConfigService;

  constructor(
    mockProvider: MockAIProvider,
    openAiProvider: OpenAIProvider,
    configService: AIConfigService
  ) {
    this.mockProvider = mockProvider;
    this.openAiProvider = openAiProvider;
    this.configService = configService;
  }

  /**
   * Resolves the active AI provider according to explicit user opt-in policy.
   * - Default is local Mock provider.
   * - OpenAI is ONLY returned if explicitly configured AND cloudEnabled is true.
   * - Never silently falls back from OpenAI to Mock.
   */
  getActiveProvider(): AIProvider {
    const config = this.configService.getConfig();

    if (config.providerType === 'openai') {
      if (!config.cloudEnabled) {
        throw new AIError(
          'OpenAI provider is selected but Cloud AI is not enabled (explicit user opt-in required)',
          'MISSING_CONFIG',
          'openai',
          false
        );
      }
      return this.openAiProvider;
    }

    return this.mockProvider;
  }
}
