import { useState, useEffect, useCallback } from 'react';
import { getAppServices } from '@/services';

export interface UseAiConfigResult {
  cloudEnabled: boolean;
  model: string;
  loading: boolean;
  testingConnection: boolean;
  testResult: { success: boolean; message: string } | null;
  error: string | null;
  setCloudEnabled: (enabled: boolean) => Promise<void>;
  testConnection: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useAiConfig(): UseAiConfigResult {
  const [cloudEnabled, setCloudEnabledState] = useState<boolean>(false);
  const [model, setModel] = useState<string>('gpt-4o-mini');
  const [loading, setLoading] = useState<boolean>(true);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const services = await getAppServices();
      const config = services.aiConfigService.getConfig();
      setCloudEnabledState(config.cloudEnabled);
      setModel(config.openAiModel || 'gpt-4o-mini');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  const setCloudEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const services = await getAppServices();
        await services.aiConfigService.setCloudEnabled(enabled);
        await services.aiConfigService.setProviderType(enabled ? 'openai' : 'mock');
        setCloudEnabledState(enabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const testConnection = useCallback(async (): Promise<void> => {
    try {
      setTestingConnection(true);
      setTestResult(null);
      setError(null);
      const services = await getAppServices();
      const result = await services.openAiProvider.testConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Lỗi kết nối tới OpenAI',
      });
    } finally {
      setTestingConnection(false);
    }
  }, []);

  return {
    cloudEnabled,
    model,
    loading,
    testingConnection,
    testResult,
    error,
    setCloudEnabled,
    testConnection,
    reload,
  };
}
