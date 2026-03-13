import { logService } from './log/logService';
import { performanceService } from './performance/performanceService';
import { ClipboardHistoryService } from './clipboard/clipboardHistoryService';
import { applicationService } from './application/applicationsService';
import extensionManager from './extension/extensionManager'; // Default export (instance)
import { commandService } from './extension/commandService'; // Import commandService instance
import * as asyarApi from 'asyar-api';
import { searchQuery } from './search/stores/search'; // Import searchQuery store
import { get } from 'svelte/store'; // Import get to read store value

// Flag to prevent multiple initializations
let isInitialized = false;

export const appInitializer = {
  async init(): Promise<boolean> {
    if (isInitialized) {
      logService.warn("Application already initialized.");
      return true;
    }

    try {
      // Expose API to global scope for runtime extensions
      (globalThis as any).__asyar_api__ = asyarApi;

      logService.custom("🚀 APP INITIALIZER: STARTING", "INIT", "magenta", "bgMagenta");
      logService.info(`Application starting initialization...`);

      // Initialize performance service first
      await performanceService.init();
      logService.custom("🔍 Performance monitoring initialized", "PERF", "cyan", "cyan");
      performanceService.logPerformanceReport(); // Initial report

      // Initialize Clipboard History
      const clipboardHistoryService = ClipboardHistoryService.getInstance();
      await clipboardHistoryService.initialize();
      logService.info(`Clipboard history service initialized.`);

      // Start overall app and specific service timing
      performanceService.startTiming("app-initialization");
      performanceService.startTiming("service-init");

      // Initialize core services
      await applicationService.init();
      await extensionManager.init(); // Initialize ExtensionManager first
      commandService.initialize(extensionManager); // Initialize CommandService with ExtensionManager instance

      const serviceInitMetrics = performanceService.stopTiming("service-init");
      logService.custom(`🔌 Core services initialized in ${serviceInitMetrics.duration?.toFixed(2)}ms`, "PERF", "green");

      isInitialized = true; // Set initialized flag

      const initMetrics = performanceService.stopTiming("app-initialization");
      logService.custom(`⚡ App initialized in ${initMetrics.duration?.toFixed(2)}ms`, "PERF", "green", "bgGreen");

      // Log performance report after a short delay
      setTimeout(() => performanceService.logPerformanceReport(), 1000);

      logService.info(`Application initialization complete.`);
      return true;

    } catch (error) {
      logService.error(`Failed to initialize application: ${error}`);
      isInitialized = false; // Reset flag on error
      return false;
    }
  },

  isAppInitialized(): boolean {
    return isInitialized;
  }
};
