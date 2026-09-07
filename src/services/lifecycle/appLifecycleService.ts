import type { AutostartService } from './autostartService';
import type { ReminderScheduler } from '../notification/reminderScheduler';
import type { DocumentWorker } from '../worker/documentWorker';
import type { DaemonStatus } from './types';

/**
 * Coordinates the application daemon lifecycle, ensuring singleton background execution,
 * clean startup recovery, and graceful shutdown.
 */
export class AppLifecycleService {
  private autostartService: AutostartService;
  private reminderScheduler: ReminderScheduler;
  private documentWorker: DocumentWorker;
  private isDaemonStarted = false;

  constructor(
    autostartService: AutostartService,
    reminderScheduler: ReminderScheduler,
    documentWorker: DocumentWorker
  ) {
    this.autostartService = autostartService;
    this.reminderScheduler = reminderScheduler;
    this.documentWorker = documentWorker;
  }

  /**
   * Starts the background daemon services (ReminderScheduler + DocumentWorker).
   * Guarded against duplicate initialization: if already started, this is a no-op.
   */
  async startDaemon(): Promise<boolean> {
    if (this.isDaemonStarted) {
      return false; // Already running, prevent duplicate instances
    }

    this.isDaemonStarted = true;

    // 1. Sync autostart configuration with OS registry
    try {
      await this.autostartService.syncOnStartup();
    } catch (err) {
      console.error('Failed to sync autostart preference with OS registry:', err);
    }

    // 2. Start ReminderScheduler (which performs startup recovery for pending/missed reminders)
    try {
      await this.reminderScheduler.start();
    } catch (err) {
      console.error('Failed to start ReminderScheduler:', err);
    }

    // 3. Start DocumentWorker background polling loop (runs stale job recovery on startup)
    try {
      this.documentWorker.startBackground();
    } catch (err) {
      console.error('Failed to start DocumentWorker background polling:', err);
    }

    return true;
  }

  /**
   * Stops background services cleanly (stops timers, flushes active state).
   */
  async stopDaemon(): Promise<void> {
    if (!this.isDaemonStarted) {
      return;
    }

    // Stop scheduler timer
    this.reminderScheduler.stop();

    // Stop worker timer
    this.documentWorker.stopBackground();

    this.isDaemonStarted = false;
  }

  /**
   * Gracefully shuts down services and terminates the application process.
   */
  async exitApp(): Promise<void> {
    await this.stopDaemon();

    // Terminate native process or close window
    try {
      // In Tauri 2 environment
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.destroy();
    } catch {
      // Non-tauri or fallback
      if (typeof window !== 'undefined') {
        window.close();
      }
    }
  }

  /**
   * Returns whether the background daemon is currently active.
   */
  isDaemonRunning(): boolean {
    return this.isDaemonStarted;
  }

  /**
   * Returns complete lifecycle and daemon health status.
   */
  async getStatus(): Promise<DaemonStatus> {
    const autostartEnabled = await this.autostartService.isEnabled();

    return {
      running: this.isDaemonStarted,
      autostartEnabled,
      schedulerActive: this.reminderScheduler.isRunning(),
      workerActive: this.documentWorker.isBackgroundRunning(),
    };
  }
}
