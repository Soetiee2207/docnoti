/**
 * Types and interfaces for application lifecycle and autostart daemon.
 */

export interface AutostartBridge {
  getAutostartStatus(): Promise<boolean>;
  setAutostartStatus(enabled: boolean): Promise<boolean>;
}

export interface DaemonStatus {
  running: boolean;
  autostartEnabled: boolean;
  schedulerActive: boolean;
  workerActive: boolean;
}

export const AUTOSTART_SETTING_KEY = 'windows.autostart.enabled';
