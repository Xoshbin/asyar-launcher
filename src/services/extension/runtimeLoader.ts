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
      logService.info(`[DIAG] Discovering extensions in: ${extensionsDir}`);
      
      if (!(await exists(extensionsDir))) {
        logService.info(`[DIAG] Extensions directory does not exist: ${extensionsDir}`);
        return [];
      }

      const entries = await readDir(extensionsDir);
      logService.info(`[DIAG] Found ${entries.length} entries in extensions directory: ${entries.map(e => e.name).join(", ")}`);
      
      const extensionIds: string[] = [];

      for (const entry of entries) {
        // Skip hidden files/folders
        if (entry.name.startsWith(".")) continue;

        const manifestPath = await join(extensionsDir, entry.name, "manifest.json");
        const hasManifest = await exists(manifestPath);
        
        logService.info(`[DIAG] Checking entry: ${entry.name}. Manifest exists: ${hasManifest} at ${manifestPath}`);
        
        if (hasManifest) {
          extensionIds.push(entry.name);
          logService.info(`Discovered installed extension: ${entry.name}`);
        }
      }

      logService.debug(`Discovery found ${extensionIds.length} unique installed extensions: ${extensionIds.join(", ")}`);
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
      
      // Candidate paths for the main bundle
      const bundleFileName = manifest.main || "dist/index.js";
      const candidatePaths = [
        await join(extensionsDir, id, bundleFileName),
        await join(extensionsDir, id, bundleFileName.replace(/\.js$/, ".global.js")),
        await join(extensionsDir, id, "dist", "index.js"),
        await join(extensionsDir, id, "dist", "index.global.js"),
        await join(extensionsDir, id, "index.js"),
        await join(extensionsDir, id, "index.global.js"),
      ];

      let bundlePath = "";
      for (const path of candidatePaths) {
        if (await exists(path)) {
          bundlePath = path;
          break;
        }
      }

      if (!bundlePath) {
        logService.error(`Bundle not found for ${id}. Checked: ${candidatePaths.join(", ")}`);
        return null;
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
    // Keep for built-in views if needed, though +page.svelte now handles it differently for runtime
    try {
      const extensionsDir = await this.getExtensionsDir();
      const viewPath = await this.resolveViewPath(id, viewName);
      if (!viewPath) return null;

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

      const mountFn = typeof module.exports === 'function' ? module.exports : ((module.exports as any).mount || (module.exports as any).default);
      return typeof mountFn === 'function' ? mountFn : null;
    } catch (error) {
      logService.error(`Failed to load view bundle for ${id}/${viewName}: ${error}`);
      return null;
    }
  },

  async resolveViewPath(id: string, viewName: string): Promise<string | null> {
    const extensionsDir = await this.getExtensionsDir();
    const candidatePaths = [
      await join(extensionsDir, id, "dist", "views", `${viewName}.js`),
      await join(extensionsDir, id, "dist", "views", `${viewName}.global.js`),
      await join(extensionsDir, id, "dist", `${viewName}.js`),
      await join(extensionsDir, id, "dist", `${viewName}.global.js`),
      await join(extensionsDir, id, "views", `${viewName}.js`),
      await join(extensionsDir, id, `${viewName}.js`),
    ];

    for (const path of candidatePaths) {
      if (await exists(path)) {
        return path;
      }
    }
    return null;
  },

  async generateIframeWrapper(id: string, viewName: string): Promise<string> {
    const viewPath = await this.resolveViewPath(id, viewName);
    if (!viewPath) throw new Error(`View ${viewName} not found for extension ${id}`);

    const bundleContent = await readTextFile(viewPath);
    
    // Minimal bridge shim to avoid needing to bundle the whole asyar-api
    const bridgeShim = `
      (function() {
        const BridgeMessageType = {
          LOG: 'LOG',
          SERVICE_CALL: 'SERVICE_CALL',
          SERVICE_RESPONSE: 'SERVICE_RESPONSE'
        };

        const pendingCalls = new Map();

        window.addEventListener('message', (event) => {
          const message = event.data;
          if (message.type === BridgeMessageType.SERVICE_RESPONSE && message.callId) {
            const pending = pendingCalls.get(message.callId);
            if (pending) {
              if (message.error) pending.reject(new Error(message.error));
              else pending.resolve(message.payload);
              pendingCalls.delete(message.callId);
            }
          }
        });

        function callRemote(type, payload) {
          const callId = Math.random().toString(36).substring(2, 9);
          return new Promise((resolve, reject) => {
            pendingCalls.set(callId, { resolve, reject });
            window.parent.postMessage({ type, payload, callId }, '*');
          });
        }

        const asyarApi = {
          ExtensionContext: class {
            constructor(services, components, isRemote) {
              this.isRemote = isRemote;
              this.extensionId = "${id}";
            }
            getService(serviceType) {
              return new Proxy({}, {
                get: (target, prop) => {
                  return (...args) => callRemote(BridgeMessageType.SERVICE_CALL, {
                    service: serviceType,
                    method: prop,
                    args
                  });
                }
              });
            }
            setExtensionId(id) { this.extensionId = id; }
          },
          RemoteBridge: {
            callRemote: callRemote
          }
        };

        window.__asyar_api__ = asyarApi;
        // Also provide 'asyar-api' as a global if the bundle expects it that way
        window.asyarApi = asyarApi; 
      })();
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { margin: 0; padding: 0; font-family: sans-serif; color: white; background: transparent; }
          </style>
          <script>${bridgeShim}</script>
        </head>
        <body>
          <div id="app"></div>
          <script>
            (function() {
              const exports = {};
              const module = { exports };
              const require = (name) => {
                if (name === 'asyar-api') return window.__asyar_api__;
                throw new Error("Module " + name + " not found");
              };
              
              (function(require, exports, module) {
                ${bundleContent}
              })(require, exports, module);

              const mountFn = typeof module.exports === 'function' ? module.exports : (module.exports.mount || module.exports.default);
              if (typeof mountFn === 'function') {
                const context = new window.__asyar_api__.ExtensionContext({}, {}, true);
                mountFn(document.getElementById('app'), context);
              }
            })();
          </script>
        </body>
      </html>
    `;
  }
};
