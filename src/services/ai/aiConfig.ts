import type { AIProvider } from './types';
import type { MockAIProvider } from './mockAiProvider';
import type { OpenAIProvider } from './openAiProvider';
import { AIError } from './types';
import type { AppSettingsRepository } from '@/repositories/appSettingsRepository';

export type AIProviderType = 'mock' | 'openai';

export interface AIConfiguration {
  providerType: AIProviderType;
  cloudEnabled: boolean;
  openAiModel?: string;
}

export const SETTING_KEYS = {
  CLOUD_AI_ENABLED: 'cloud_ai_enabled',
  AI_PROVIDER_TYPE: 'ai_provider_type',
  OPENAI_MODEL: 'openai_model',
} as const;

export class AIConfigService {
  private config: AIConfiguration;
  private appSettingsRepo?: AppSettingsRepository;

  constructor(
    initialConfig?: Partial<AIConfiguration>,
    appSettingsRepo?: AppSettingsRepository
  ) {
    this.appSettingsRepo = appSettingsRepo;
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

  async setProviderType(providerType: AIProviderType): Promise<void> {
    this.config.providerType = providerType;
    if (this.appSettingsRepo) {
      await this.appSettingsRepo.set(SETTING_KEYS.AI_PROVIDER_TYPE, providerType);
    }
  }

  async setCloudEnabled(cloudEnabled: boolean): Promise<void> {
    this.config.cloudEnabled = cloudEnabled;
    if (this.appSettingsRepo) {
      await this.appSettingsRepo.setBoolean(SETTING_KEYS.CLOUD_AI_ENABLED, cloudEnabled);
    }
  }

  async setOpenAiModel(model: string): Promise<void> {
    this.config.openAiModel = model;
    if (this.appSettingsRepo) {
      await this.appSettingsRepo.set(SETTING_KEYS.OPENAI_MODEL, model);
    }
  }

  async loadFromStorage(): Promise<void> {
    if (!this.appSettingsRepo) return;
    const cloudEnabled = await this.appSettingsRepo.getBoolean(SETTING_KEYS.CLOUD_AI_ENABLED, false);
    const providerType = ((await this.appSettingsRepo.get(SETTING_KEYS.AI_PROVIDER_TYPE)) as AIProviderType) || (cloudEnabled ? 'openai' : 'mock');
    const model = (await this.appSettingsRepo.get(SETTING_KEYS.OPENAI_MODEL)) || 'gpt-4o-mini';

    this.config = {
      cloudEnabled,
      providerType,
      openAiModel: model,
    };
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
