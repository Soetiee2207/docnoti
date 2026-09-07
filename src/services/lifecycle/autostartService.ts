import type { AppSettingsRepository } from '../../repositories/appSettingsRepository';
import { AUTOSTART_SETTING_KEY, type AutostartBridge } from './types';

/**
 * Default Tauri IPC bridge for native autostart registry operations.
 */
export class TauriAutostartBridge implements AutostartBridge {
  async getAutostartStatus(): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('get_autostart_status');
    } catch {
      // In non-tauri or fallback environments, report false
      return false;
    }
  }

  async setAutostartStatus(enabled: boolean): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('set_autostart_status', { enabled });
    } catch {
      return false;
    }
  }
}

/**
 * Service managing the Windows Autostart preference and OS registry synchronization.
 * Autostart is strictly opt-in and disabled by default.
 */
export class AutostartService {
  private bridge: AutostartBridge;
  private settingsRepo: AppSettingsRepository;

  constructor(settingsRepo: AppSettingsRepository, bridge?: AutostartBridge) {
    this.settingsRepo = settingsRepo;
    this.bridge = bridge ?? new TauriAutostartBridge();
  }

  /**
   * Checks whether autostart is currently enabled.
   * Priority is given to the persistent user setting (default: false).
   */
  async isEnabled(): Promise<boolean> {
    const settingValue = await this.settingsRepo.getBoolean(AUTOSTART_SETTING_KEY, false);
    return settingValue;
  }

  /**
   * Sets the autostart preference.
   * Updates SQLite settings and syncs with the native OS registry.
   */
  async setEnabled(enabled: boolean): Promise<boolean> {
    // 1. Sync with native OS bridge
    await this.bridge.setAutostartStatus(enabled);

    // 2. Persist preference in SQLite
    await this.settingsRepo.setBoolean(AUTOSTART_SETTING_KEY, enabled);

    return enabled;
  }

  /**
   * Syncs OS registry status with persisted setting during startup recovery.
   * If setting is enabled, ensures native registration is active.
   */
  async syncOnStartup(): Promise<void> {
    const isConfigured = await this.isEnabled();
    if (isConfigured) {
      await this.bridge.setAutostartStatus(true);
    }
  }
}
