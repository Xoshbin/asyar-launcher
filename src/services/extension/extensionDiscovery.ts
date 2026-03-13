import { logService } from "../log/logService";
import type { ExtensionManifest } from "asyar-api";

// Import built-in extensions via build-time glob
const builtInExtensionContext = import.meta.glob(
  "../../built-in-extensions/*/manifest.json"
);

// New type to store indexed extension metadata
export interface ExtensionIndex {
  id: string;
  path: string;
  manifest: ExtensionManifest;
  loaded: boolean;
  isInstalled?: boolean; // True if loaded from appDataDir at runtime
}

export async function discoverExtensions(): Promise<string[]> {
  try {
    const builtInExtensionPaths = Object.keys(builtInExtensionContext);

    const builtInExtensionIds = builtInExtensionPaths
      .map((path) => {
        const matches = path.match(
          /\/built-in-extensions\/([^\/]+)\/manifest\.json/
        );
        return matches ? matches[1] : null;
      })
      .filter((id) => id !== null) as string[];

    logService.info(`[DIAG] Built-in extensions found: ${builtInExtensionIds.join(", ")}`);

    // Import runtime discovery (dynamic import to avoid circular dependency if any)
    const { runtimeLoader } = await import("./runtimeLoader");
    const installedIds = await runtimeLoader.discoverInstalledExtensions();

    const allExtensionIds = Array.from(new Set([
      ...builtInExtensionIds,
      ...installedIds
    ]));

    logService.info(
      `Discovery result: ${allExtensionIds.length} unique extensions identified (${builtInExtensionIds.length} built-in, ${installedIds.length} installed: ${installedIds.join(", ")})`
    );

    return allExtensionIds;
  } catch (err) {
    logService.error(`No extensions found or error during discovery: ${err}`);
    return [];
  }
}

// Helper to determine if an extension ID is from built-in directory
export function isBuiltInExtension(extensionId: string): boolean {
  const builtInPaths = Object.keys(builtInExtensionContext);
  const matchingPath = builtInPaths.find((path) =>
    path.includes(`/${extensionId}/`)
  );
  return !!matchingPath;
}

// Function to get the import path for an extension ID
export function getExtensionPath(extensionId: string): string {
  if (isBuiltInExtension(extensionId)) {
    return `../../built-in-extensions/${extensionId}`;
  } else {
    // This will now only be used for dev or fallbacks until runtime path is resolved
    return `../../extensions/${extensionId}`;
  }
}

// New function to load only extension manifests without the actual extension code
export async function indexExtensions(): Promise<ExtensionIndex[]> {
  try {
    const extensionIds = await discoverExtensions();
    const extensionIndexes: ExtensionIndex[] = [];

    const { runtimeLoader } = await import("./runtimeLoader");
    for (const id of extensionIds) {
      try {
        const isBuiltIn = isBuiltInExtension(id);
        let manifest: ExtensionManifest | null = null;
        let path = "";

        if (isBuiltIn) {
          path = `../../built-in-extensions/${id}`;
          // Built-in manifests are bundled and can be imported directly
          const manifestModule = await import(
            /* @vite-ignore */ `${path}/manifest.json`
          );
          manifest = (manifestModule.default || manifestModule) as ExtensionManifest;
        } else {
          path = await runtimeLoader.getExtensionsDir();
          // Runtime manifests must be read from disk
          manifest = await runtimeLoader.loadManifestFromDisk(id);
        }

        if (manifest) {
          // Create index entry
          extensionIndexes.push({
            id,
            path: isBuiltIn ? path : `${path}/${id}`,
            manifest,
            loaded: false,
            isInstalled: !isBuiltIn
          });

          logService.debug(
            `Indexed extension: ${manifest.name} (${id}) - ${
              isBuiltIn ? "built-in" : "runtime"
            }`
          );
        }
      } catch (error) {
        logService.error(`Failed to index extension ${id}: ${error}`);
      }
    }

    logService.info(`Indexed ${extensionIndexes.length} extensions`);
    return extensionIndexes;
  } catch (error) {
    logService.error(`Failed to index extensions: ${error}`);
    return [];
  }
}
