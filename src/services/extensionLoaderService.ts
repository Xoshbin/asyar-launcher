import { logService } from './log/logService';
import { performanceService } from './performance/performanceService';
import { discoverExtensions, isBuiltInExtension } from './extension/extensionDiscovery';
import { runtimeLoader } from './extension/runtimeLoader';
import type { Extension, ExtensionManifest } from 'asyar-api';

export const extensionLoaderService = {

    async loadAllExtensions(): Promise<Map<string, { extension: Extension, manifest: ExtensionManifest }>> {
        const loadedExtensions = new Map<string, { extension: Extension, manifest: ExtensionManifest }>();
        try {
            performanceService.startTiming("extension-discovery");
            
            // 1. Discover built-in extensions (via Vite globs in discovery service)
            const builtInIds = (await discoverExtensions()).filter(id => isBuiltInExtension(id));
            
            // 2. Discover installed extensions (via FS)
            const installedIds = await runtimeLoader.discoverInstalledExtensions();
            
            const allIds = Array.from(new Set([...builtInIds, ...installedIds]));
            
            logService.debug(`Discovery returned ${allIds.length} extension IDs (${builtInIds.length} built-in, ${installedIds.length} installed)`);
            performanceService.stopTiming("extension-discovery");

            const extensionPairs = await Promise.all(
                allIds.map(id => this.loadSingleExtension(id))
            );

            for (const pair of extensionPairs) {
                if (pair && pair.manifest && pair.manifest.id) {
                    loadedExtensions.set(pair.manifest.id, { extension: pair.extension, manifest: pair.manifest });
                }
            }
            
            return loadedExtensions;

        } catch (error) {
            logService.error(`Failed during extension loading process: ${error}`);
            return loadedExtensions;
        }
    },

    async loadSingleExtension(id: string): Promise<{ extension: Extension, manifest: ExtensionManifest } | null> {
        const isBuiltIn = isBuiltInExtension(id);
        logService.debug(`Attempting to load extension: ${id} (isBuiltIn: ${isBuiltIn})`);
        
        if (isBuiltIn) {
            // Built-in extensions use Vite's dynamic import (bundled at build time)
            const path = `../built-in-extensions/${id}`;
            const manifestPath = `${path}/manifest.json`;

            try {
                performanceService.startTiming(`load-builtin:${id}`);
                const [extensionModule, manifestModule] = await Promise.all([
                    import(/* @vite-ignore */ path),
                    import(/* @vite-ignore */ manifestPath),
                ]);

                const manifest = (manifestModule.default || manifestModule) as ExtensionManifest;
                const extension = extensionModule.default as Extension;

                if (!extension || typeof extension.executeCommand !== 'function') {
                    throw new Error(`Invalid extension structure for ${id}`);
                }

                performanceService.stopTiming(`load-builtin:${id}`);
                logService.info(`Loaded built-in extension: ${manifest.name} (${id})`);
                return { extension, manifest };
            } catch (error) {
                logService.error(`Failed to load built-in extension ${id}: ${error}`);
                return null;
            }
        } else {
            // Non-built-in extensions use runtimeLoader (loaded from disk at runtime)
            try {
                performanceService.startTiming(`load-runtime:${id}`);
                logService.debug(`Loading runtime extension: ${id}`);
                
                const manifest = await runtimeLoader.loadManifestFromDisk(id);
                if (!manifest) {
                    logService.warn(`Manifest not found for installed extension ${id}`);
                    return null;
                }

                logService.debug(`Loaded manifest for ${id}: ${manifest.name}. Loading bundle...`);
                const extension = await runtimeLoader.loadExtensionBundleFromDisk(id, manifest);
                if (!extension) {
                    logService.error(`Failed to load bundle for installed extension ${id}`);
                    return null;
                }

                performanceService.stopTiming(`load-runtime:${id}`);
                logService.info(`Loaded installed extension: ${manifest.name} (${id})`);
                return { extension, manifest };
            } catch (error) {
                logService.error(`Failed to load runtime extension ${id}: ${error}`);
                return null;
            }
        }
    }
};
