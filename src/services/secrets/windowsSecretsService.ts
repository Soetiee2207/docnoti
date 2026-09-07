import type { SecretsService } from './types';

export interface WindowsSecretsNativeBridge {
  isAvailable(): Promise<boolean>;
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  hasSecret(key: string): Promise<boolean>;
}

function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Windows-native SecretsService adapter backed by Windows Credential Manager via Tauri IPC.
 * Strictly adheres to ADR-012:
 * - Credentials stored in OS Credential Store, outside SQLite and outside source files.
 * - Errors sanitized so secret contents are never exposed in error text or logs.
 */
export class WindowsSecretsService implements SecretsService {
  private bridge?: WindowsSecretsNativeBridge;

  constructor(bridge?: WindowsSecretsNativeBridge) {
    this.bridge = bridge;
  }

  async isAvailable(): Promise<boolean> {
    if (this.bridge) {
      try {
        return await this.bridge.isAvailable();
      } catch {
        return false;
      }
    }
    return isTauriEnvironment();
  }

  async getSecret(key: string): Promise<string | null> {
    if (this.bridge) {
      return await this.bridge.getSecret(key);
    }

    if (!isTauriEnvironment()) {
      return null;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const val = await invoke<string | null>('get_secret', { key });
      return val ?? null;
    } catch (err) {
      console.error(`[SecretsService] Failed to read secret for key "${key}":`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (this.bridge) {
      try {
        await this.bridge.setSecret(key, value);
        return;
      } catch (err) {
        console.error(`[SecretsService] Failed to set secret for key "${key}"`);
        throw new Error(`Không thể lưu thông tin xác thực vào Windows Credential Manager: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!isTauriEnvironment()) {
      throw new Error(`[SecretsService] Secure credential store is unavailable in this environment`);
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<void>('set_secret', { key, value });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SecretsService] Failed to set secret for key "${key}"`);
      throw new Error(`Không thể lưu thông tin xác thực vào Windows Credential Manager: ${msg}`);
    }
  }

  async deleteSecret(key: string): Promise<void> {
    if (this.bridge) {
      try {
        await this.bridge.deleteSecret(key);
        return;
      } catch (err) {
        console.error(`[SecretsService] Failed to delete secret for key "${key}"`);
        throw new Error(`Không thể xóa thông tin xác thực khỏi Windows Credential Manager: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!isTauriEnvironment()) {
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<void>('delete_secret', { key });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SecretsService] Failed to delete secret for key "${key}"`);
      throw new Error(`Không thể xóa thông tin xác thực khỏi Windows Credential Manager: ${msg}`);
    }
  }

  async hasSecret(key: string): Promise<boolean> {
    if (this.bridge) {
      return await this.bridge.hasSecret(key);
    }

    if (!isTauriEnvironment()) {
      return false;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('has_secret', { key });
    } catch (err) {
      console.error(`[SecretsService] Failed to check secret for key "${key}":`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}
