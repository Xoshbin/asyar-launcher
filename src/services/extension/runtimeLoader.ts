import { logService } from "../log/logService";
import { performanceService } from "../performance/performanceService";
import type { Extension } from "asyar-api";
import type { ExtensionManifest } from "asyar-api";
import { readTextFile, exists, readDir, mkdir } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

export const runtimeLoader = {
  async getExtensionsDir(): Promise<string> {
    const appDir = await appDataDir();
    const extensionsDir = await join(appDir, "extensions");
    if (!(await exists(extensionsDir))) {
      logService.info(`Creating extensions directory at ${extensionsDir}`);
      // Using any as mkdir is from plugin-fs and we need to be careful with its signature in different versions
      await (mkdir as any)(extensionsDir, { recursive: true });
    }
    return extensionsDir;
  },

  async discoverInstalledExtensions(): Promise<string[]> {
    try {
      const extensionsDir = await this.getExtensionsDir();
      if (!(await exists(extensionsDir))) {
        logService.debug(`Extensions directory does not exist: ${extensionsDir}`);
        return [];
      }

      const entries = await readDir(extensionsDir);
      const extensionIds: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory) {
          const manifestPath = await join(extensionsDir, entry.name, "manifest.json");
          if (await exists(manifestPath)) {
            extensionIds.push(entry.name);
          }
        }
      }

      return extensionIds;
    } catch (error) {
      logService.error(`Failed to discover installed extensions: ${error}`);
      return [];
    }
  },

  async loadManifestFromDisk(id: string): Promise<ExtensionManifest | null> {
    try {
      const extensionsDir = await this.getExtensionsDir();
      const manifestPath = await join(extensionsDir, id, "manifest.json");
      
      if (!(await exists(manifestPath))) {
        return null;
      }

      const content = await readTextFile(manifestPath);
      return JSON.parse(content) as ExtensionManifest;
    } catch (error) {
      logService.error(`Failed to load manifest for ${id}: ${error}`);
      return null;
    }
  },

  async loadExtensionBundleFromDisk(id: string, manifest: ExtensionManifest): Promise<Extension | null> {
    try {
      const extensionsDir = await this.getExtensionsDir();
      // Usually built extensions are in dist/index.js or just index.js
      const bundleFileName = manifest.main || "dist/index.js";
      const bundlePath = await join(extensionsDir, id, bundleFileName);

      if (!(await exists(bundlePath))) {
        // Try fallback to root index.js if dist/index.js not found
        const fallbackPath = await join(extensionsDir, id, "index.js");
        if (!(await exists(fallbackPath))) {
          logService.error(`Bundle not found for ${id} at ${bundlePath} or ${fallbackPath}`);
          return null;
        }
      }

      const bundleContent = await readTextFile(bundlePath);

      // Injects asyar-api context (this will be expanded)
      // For now, we use a Function constructor to evaluate the bundle
      // and expect it to set a global or return the extension object.
      // Standard pattern: bundle is an IIFE that returns the default export
      // or we use a more sophisticated loader.
      
      // Setup global bridge if not exists
      if (!(globalThis as any).__asyar_api__) {
        logService.warn("ExtensionBridge not found on globalThis. API injection might fail.");
      }

      try {
        // Create a sandbox-like evaluation (not truly sandboxed, but scoped)
        const moduleFunc = new Function('require', 'exports', 'module', '__filename', '__dirname', bundleContent);
        const exports = {};
        const module = { exports };
        
        moduleFunc(
          (name: string) => {
            if (name === 'asyar-api') return (globalThis as any).__asyar_api__;
            throw new Error(`Module ${name} not found in runtime extension context`);
          },
          exports,
          module,
          bundlePath,
          await join(extensionsDir, id)
        );

        const extension = (module.exports as any).default || module.exports;

        if (extension && typeof extension.executeCommand === 'function') {
          return extension as Extension;
        }

        logService.error(`Extension ${id} loaded but does not implement Extension interface`);
        return null;
      } catch (evalError) {
        const message = evalError instanceof Error ? evalError.message : String(evalError);
        logService.error(`Error evaluating extension bundle for ${id}: ${message}`);
        return null;
      }
    } catch (error) {
      logService.error(`Failed to load extension bundle for ${id}: ${error}`);
      return null;
    }
  },
  async loadViewFromDisk(id: string, viewName: string): Promise<Function | null> {
    try {
      const extensionsDir = await this.getExtensionsDir();
      const viewPath = await join(extensionsDir, id, "dist", "views", `${viewName}.js`);
      
      if (!(await exists(viewPath))) {
        logService.error(`View bundle not found for ${id}/${viewName} at ${viewPath}`);
        return null;
      }

      const bundleContent = await readTextFile(viewPath);
      
      const moduleFunc = new Function('require', 'exports', 'module', bundleContent);
      const exports = {};
      const module = { exports };
      
      moduleFunc(
        (name: string) => {
          if (name === 'asyar-api') return (globalThis as any).__asyar_api__;
          throw new Error(`Module ${name} not found in runtime view context`);
        },
        exports,
        module
      );

      const mountFn = (module.exports as any).mount || (module.exports as any).default;
      return typeof mountFn === 'function' ? mountFn : null;
    } catch (error) {
      logService.error(`Failed to load view bundle for ${id}/${viewName}: ${error}`);
      return null;
    }
  }
};
