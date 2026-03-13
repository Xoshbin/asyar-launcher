import { writable } from "svelte/store";
import type {
  ExtensionContext,
  ILogService,
  INotificationService,
  IExtensionManager,
} from "asyar-api";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile, remove } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";

interface ExtensionInstallerState {
  url: string;
  isLoading: boolean;
  error: string | null;
  success: string | null;
  installingExtensionName: string | null;
  recentInstalls: {
    name: string;
    url: string;
    timestamp: number;
    success: boolean;
  }[];
}

function createExtensionInstallerState() {
  const { subscribe, set, update } = writable<ExtensionInstallerState>({
    url: "",
    isLoading: false,
    error: null,
    success: null,
    installingExtensionName: null,
    recentInstalls: [],
  });

  let logService: ILogService;
  let notificationService: INotificationService;
  let extensionManager: IExtensionManager;

  function initializeServices(context: ExtensionContext) {
    logService = context.getService<ILogService>("LogService");
    notificationService = context.getService<INotificationService>(
      "NotificationService"
    );
    extensionManager =
      context.getService<IExtensionManager>("ExtensionManager");

    // Load recent installs from localStorage
    try {
      const savedInstalls = localStorage.getItem("asyar-extension-installs");
      if (savedInstalls) {
        const parsed = JSON.parse(savedInstalls);
        update((state) => ({
          ...state,
          recentInstalls: parsed,
        }));
      }
    } catch (error) {
      console.error("Failed to load recent installs", error);
    }
  }

  function setUrl(url: string) {
    update((state) => ({
      ...state,
      url,
      error: null,
      success: null,
    }));
  }

  function saveRecentInstall(install: {
    name: string;
    url: string;
    success: boolean;
  }) {
    update((state) => {
      const newInstalls = [
        {
          ...install,
          timestamp: Date.now(),
        },
        ...state.recentInstalls.slice(0, 9), // Keep only 10 most recent
      ];

      // Save to localStorage
      try {
        localStorage.setItem(
          "asyar-extension-installs",
          JSON.stringify(newInstalls)
        );
      } catch (error) {
        console.error("Failed to save recent installs", error);
      }

      return {
        ...state,
        recentInstalls: newInstalls,
      };
    });
  }

  async function installExtension(
    url: string
  ): Promise<{ success: boolean; message: string }> {
    if (!url) {
      return { success: false, message: "No URL provided" };
    }

    update((state) => ({
      ...state,
      isLoading: true,
      error: null,
      success: null,
      installingExtensionName: extractNameFromUrl(url),
    }));

    try {
      // Create extensions directory if it doesn't exist
      const appDirPath = await appDataDir();
      const extensionsDir = await join(appDirPath, "extensions");

      if (!(await exists(extensionsDir))) {
        await createDir(extensionsDir, { recursive: true });
      }

      // Clone repository or download zip based on URL
      if (url.startsWith("/") || url.startsWith("file://")) {
        // Handle local path installation (dev mode)
        const localPath = url.startsWith("file://") ? url.slice(7) : url;
        const result = await installFromLocalPath(localPath, extensionsDir);
        
        if (result.success) {
          update((state) => ({
            ...state,
            isLoading: false,
            success: `Successfully linked extension from ${localPath}`,
            error: null,
          }));

          saveRecentInstall({
            name: result.name || extractNameFromUrl(localPath),
            url: localPath,
            success: true,
          });

          notificationService.notify({
            title: "Extension Linked",
            body: `Successfully linked ${result.name || "extension"}`,
          });

          await extensionManager.refreshExtensions();
          return { success: true, message: "Extension linked successfully" };
        } else {
          update((state) => ({
            ...state,
            isLoading: false,
            error: result.error || "Linking failed",
            success: null,
          }));
          return { success: false, message: result.error || "Linking failed" };
        }
      } else if (url.includes("github.com")) {
        const result = await installFromGitHub(url, extensionsDir);

        if (result.success) {
          update((state) => ({
            ...state,
            isLoading: false,
            success: `Successfully installed extension from ${url}`,
            error: null,
          }));

          saveRecentInstall({
            name: result.name || extractNameFromUrl(url),
            url,
            success: true,
          });

          notificationService.notify({
            title: "Extension Installed",
            body: `Successfully installed ${result.name || "extension"}`,
          });

          // Refresh extensions to load the new one
          await extensionManager.refreshExtensions();

          return {
            success: true,
            message: `Successfully installed extension from ${url}`,
          };
        } else {
          update((state) => ({
            ...state,
            isLoading: false,
            error: result.error || "Installation failed",
            success: null,
          }));

          saveRecentInstall({
            name: extractNameFromUrl(url),
            url,
            success: false,
          });

          return { success: false, message: result.error || "Installation failed" };
        }
      } else if (url.includes("asyar.org")) {
        // Handle asyar.org specific downloads
        // For this implementation, we'll just assume a GitHub link for simplicity
        return {
          success: false,
          message: "Direct asyar.org downloads not yet implemented",
        };
      } else {
        update((state) => ({
          ...state,
          isLoading: false,
          error: "Unsupported URL format. Please use GitHub repository URLs.",
          success: null,
        }));
        return { success: false, message: "Unsupported URL format" };
      }
    } catch (error) {
      const errorMsg = `Failed to install extension: ${error}`;
      logService?.error(errorMsg);

      update((state) => ({
        ...state,
        isLoading: false,
        error: errorMsg,
        success: null,
      }));

      return { success: false, message: errorMsg };
    }
  }

  async function installFromGitHub(
    url: string,
    extensionsDir: string
  ): Promise<{ success: boolean; error?: string; name?: string }> {
    try {
      // Extract the repo owner and name from the URL
      const repoMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!repoMatch) {
        return { success: false, error: "Invalid GitHub URL format" };
      }

      const [_, owner, repo] = repoMatch;
      let repoName = repo;

      // Handle URLs with .git extension or additional paths
      if (repoName.endsWith(".git")) {
        repoName = repoName.slice(0, -4);
      }

      // Check if destination directory already exists
      const extensionPath = await join(extensionsDir, repoName);
      if (await exists(extensionPath)) {
        return {
          success: false,
          error: `Extension '${repoName}' already exists`,
        };
      }

      // Clone the repository using git command (shallow clone for reliability)
      const output = await Command.create("git-clone", [
        "clone",
        "--depth",
        "1",
        url,
        extensionPath,
      ]).execute();

      if (output.code !== 0) {
        logService?.error(`Git clone failed: ${output.stderr}`);
        return { success: false, error: `Git clone failed: ${output.stderr}` };
      }

      // Verify manifest exists
      const manifestPath = await join(extensionPath, "manifest.json");
      if (!(await exists(manifestPath))) {
        logService?.error(`Extension cloned but manifest.json not found in ${repoName}`);
        return {
          success: false,
          error: `Invalid extension: manifest.json not found in the repository root.`,
        };
      }

      // 4. Install dependencies and build if package.json exists
      return await postInstallProcess(extensionPath, repoName);
    } catch (error) {
      logService?.error(`GitHub install error: ${error}`);
      return {
        success: false,
        error: `Failed to install from GitHub: ${error}`,
      };
    }
  }

  async function installFromLocalPath(
    localPath: string,
    extensionsDir: string
  ): Promise<{ success: boolean; error?: string; name?: string }> {
    try {
      // 1. Verify manifest exists in local path
      const manifestPath = await join(localPath, "manifest.json");
      if (!(await exists(manifestPath))) {
        return { success: false, error: "Local path must contain a manifest.json" };
      }

      // 2. Extract name
      const manifestContent = await readTextFile(manifestPath);
      const manifest = JSON.parse(manifestContent);
      const repoName = manifest.id || extractNameFromUrl(localPath);

      // 3. Create destination symlink
      const extensionPath = await join(extensionsDir, repoName);
      if (await exists(extensionPath)) {
         return { success: false, error: `Extension '${repoName}' already exists at destination` };
      }

      logService?.info(`Linking local extension ${localPath} to ${extensionPath}...`);
      
      const linkOutput = await Command.create("ln-s", ["-s", localPath, extensionPath]).execute();
      
      if (linkOutput.code !== 0) {
        return { success: false, error: `Symbolic link failed: ${linkOutput.stderr}` };
      }

      // 4. Build and install dependencies (Reuse same logic as GitHub)
      // For brevity, we could refactor the build logic into a shared function, 
      // but for now we'll just implement the core steps or reference them.
      const result = await postInstallProcess(extensionPath, repoName);
      return result;
    } catch (error) {
       return { success: false, error: `Local installation failed: ${error}` };
    }
  }

  async function postInstallProcess(extensionPath: string, repoName: string): Promise<{ success: boolean; error?: string; name?: string }> {
      try {
        // Build if package.json exists
        const packageJsonPath = await join(extensionPath, "package.json");
        if (await exists(packageJsonPath)) {
            const appDataSdkPath = await join(await appDataDir(), "asyar-api");
            const apiGithubUrl = "git+https://github.com/Xoshbin/asyar-sdk.git#feat/dynamic-extension-support";

            let sdkToInstall = apiGithubUrl;
            try {
              if (await exists(appDataSdkPath)) {
                sdkToInstall = appDataSdkPath;
                logService?.info("Using pre-built SDK from AppData");
              }
            } catch (e) {}

            // Clean up all problematic files that might contain broken relative paths
            const filesToDelete = ["pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", "yarn.lock", "package-lock.json"];
            for (const file of filesToDelete) {
              try {
                const filePath = await join(extensionPath, file);
                if (await exists(filePath)) {
                  logService?.info(`Removing ${file}...`);
                  await remove(filePath);
                }
              } catch (e) {
                logService?.debug(`Failed to remove ${file} (likely non-existent or forbidden): ${e}`);
              }
            }
            
            try {
              const nmPath = await join(extensionPath, "node_modules");
              if (await exists(nmPath)) {
                logService?.info(`Removing existing node_modules...`);
                await remove(nmPath, { recursive: true });
              }
            } catch (e) {
              logService?.warn(`Failed to remove node_modules: ${e}`);
            }

            try {
              const content = await readTextFile(packageJsonPath);
              const pkg = JSON.parse(content);
              let modified = false;
              
              // Deep clean package.json of any asyar-api references
              ['dependencies', 'devDependencies', 'peerDependencies', 'resolutions'].forEach(key => {
                if (pkg[key] && pkg[key]['asyar-api']) {
                   delete pkg[key]['asyar-api'];
                   modified = true;
                }
              });

              // Check pnpm overrides
              if (pkg.pnpm && pkg.pnpm.overrides && pkg.pnpm.overrides['asyar-api']) {
                delete pkg.pnpm.overrides['asyar-api'];
                modified = true;
              }

              // IMPORTANT: Allow asyar-api to run its build/prepare scripts
              // This resolves ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED
              if (!pkg.pnpm) pkg.pnpm = {};
              if (!pkg.pnpm.onlyBuiltDependencies) pkg.pnpm.onlyBuiltDependencies = [];
              
              // We support both array and map formats for robustness
              if (Array.isArray(pkg.pnpm.onlyBuiltDependencies)) {
                if (!pkg.pnpm.onlyBuiltDependencies.includes('asyar-api')) {
                  pkg.pnpm.onlyBuiltDependencies.push('asyar-api');
                  modified = true;
                }
              } else if (typeof pkg.pnpm.onlyBuiltDependencies === 'object') {
                pkg.pnpm.onlyBuiltDependencies['asyar-api'] = true;
                modified = true;
              }

              if (modified) {
                await writeTextFile(packageJsonPath, JSON.stringify(pkg, null, 2));
                logService?.info(`Modified package.json to resolve SDK dependencies`);
              }
            } catch (e) {
              const errorMsg = `Failed to modify package.json: ${e}. This is likely a permission issue.`;
              logService?.error(errorMsg);
              return { success: false, error: errorMsg };
            }

            logService?.info(`Integrating SDK from: ${sdkToInstall}`);
            const addResult = await Command.create("pnpm-add", ["add", sdkToInstall, "--save-peer"], { cwd: extensionPath }).execute();
            if (addResult.code !== 0) {
               const errorMsg = `SDK Integration failed (Code ${addResult.code}): ${addResult.stderr || addResult.stdout || "Unknown error"}`;
               logService?.error(errorMsg);
               return { success: false, error: errorMsg };
            }

            logService?.info(`Installing dependencies for ${repoName}...`);
            const installOutput = await Command.create("pnpm-install", ["install", "--no-frozen-lockfile"], { cwd: extensionPath }).execute();

            if (installOutput.code === 0) {
              logService?.info(`Building ${repoName}...`);
              const buildOutput = await Command.create("pnpm-build", ["run", "build"], { cwd: extensionPath }).execute();
              if (buildOutput.code !== 0) {
                const buildError = `Build failed (Code ${buildOutput.code}): ${buildOutput.stderr || buildOutput.stdout || "No output"}`;
                return { success: false, error: buildError };
              }
            } else {
               const installError = `Install failed (Code ${installOutput.code}): ${installOutput.stderr || installOutput.stdout || "No output"}`;
               return { success: false, error: installError };
            }
        }
        return { success: true, name: repoName };
      } catch (error) {
          return { success: false, error: `Post-install process failed: ${error}` };
      }
  }

  function extractNameFromUrl(url: string): string {
    try {
      // For GitHub URLs, extract the repo name
      if (url.includes("github.com")) {
        const parts = url.split("/");
        let repoName =
          parts[parts.length - 1] || parts[parts.length - 2] || "unknown";

        // Remove .git extension if present
        if (repoName.endsWith(".git")) {
          repoName = repoName.slice(0, -4);
        }

        return repoName;
      }

      // For other URLs, just return the domain
      const domain = new URL(url).hostname;
      return domain || "extension";
    } catch (error) {
      return "extension";
    }
  }

  function reset() {
    update((state) => ({
      ...state,
      url: "",
      error: null,
      success: null,
      installingExtensionName: null,
    }));
  }

  return {
    subscribe,
    setUrl,
    installExtension,
    reset,
    initializeServices,
  };
}

export const extensionInstallerState = createExtensionInstallerState();
async function appDir() {
  return await appDataDir();
}

async function existsHelper(path: string) {
  return await exists(path);
}

async function createDir(path: string, options: { recursive: boolean }) {
  return await mkdir(path, options);
}
