<script lang="ts">
  import { onMount } from 'svelte';
  import {
    SettingsSection,
    SettingsRow,
    Toggle,
    SettingsRadioGroup,
    ShortcutRecorder,
  } from '../../../components';
  import type { SettingsHandler } from '../settingsHandlers.svelte';
  import { shortcutService } from '../../../built-in-features/shortcuts/shortcutService';
  import { normalizeShortcut } from '../../../built-in-features/shortcuts/shortcutFormatter';
  import { applyTheme, removeTheme } from '../../../services/theme/themeService';
  import { discoverExtensions } from '../../../lib/ipc/commands';
  import { settingsService } from '../../../services/settings/settingsService.svelte';
  import { emit } from '@tauri-apps/api/event';

  let {
    handler,
  }: {
    handler: SettingsHandler;
  } = $props();

  // Appearance state (moved from AppearanceTab)
  let themeExtensions = $state<Array<{ id: string; name: string; author?: string; version: string }>>([]);
  let activeThemeId = $state<string | null>(null);

  onMount(async () => {
    try {
      const records = await discoverExtensions();
      themeExtensions = records
        .filter((r: any) => r.manifest.type === 'theme' && r.enabled)
        .map((r: any) => ({
          id: r.manifest.id,
          name: r.manifest.name,
          author: r.manifest.author ?? undefined,
          version: r.manifest.version,
        }));
      activeThemeId = handler.settings?.appearance?.activeTheme ?? null;
    } catch (e) {
      console.error('Failed to load theme extensions:', e);
    }
  });

  // Shortcut logic (moved from ShortcutsTab)
  async function conflictChecker(shortcut: string): Promise<{ name: string } | null> {
    const conflict = await shortcutService.isConflict(normalizeShortcut(shortcut), 'launcher');
    if (conflict) return { name: conflict.itemName };
    return null;
  }

  async function handleSave(detail: { modifier: string; key: string }): Promise<string | true> {
    handler.selectedModifier = detail.modifier;
    handler.selectedKey = detail.key;
    handler.isSaving = true;
    handler.saveMessage = '';
    handler.saveError = false;

    try {
      const { updateShortcut } = await import('../../../utils/shortcutManager');
      const success = await updateShortcut(detail.modifier, detail.key);
      handler.isSaving = false;
      if (success) return true;
      return 'Cannot save, shortcut may be reserved by the OS or another app';
    } catch (e) {
      handler.isSaving = false;
      return 'Cannot save, shortcut may be reserved by the OS or another app';
    }
  }

  // Appearance logic (moved from AppearanceTab)
  async function selectLaunchView(launchView: 'default' | 'compact') {
    await handler.updateLaunchView(launchView);
    await emit('asyar:launch-view-changed', { launchView });
  }

  async function selectTheme(themeId: string | null) {
    try {
      if (themeId) {
        await applyTheme(themeId);
      } else {
        removeTheme();
      }
      activeThemeId = themeId;
      await settingsService.updateSettings('appearance', { activeTheme: themeId });
      await emit('asyar:theme-changed', { themeId });
    } catch (error) {
      console.error('Failed to apply theme:', error);
    }
  }
</script>

<SettingsSection title="Startup">
  <SettingsRow
    label="Launch at login"
    description="Automatically start Asyar when you log in to your computer"
  >
    <Toggle
      checked={handler.settings.general.startAtLogin}
      onchange={() => handler.handleAutostartToggle()}
    />
  </SettingsRow>

  <SettingsRow
    label="Include extension results in search"
    description="Allow your installed extensions to show results in the search bar. May increase memory usage and slightly slow down search."
  >
    <Toggle
      checked={handler.settings.search.enableExtensionSearch}
      onchange={() => handler.handleExtensionSearchToggle()}
    />
  </SettingsRow>

  <SettingsRadioGroup
    label="Escape key behavior in views"
    description="Choose what happens when you press Escape while a view is open"
    name="escapeBehavior"
    options={[
      { value: 'close-window', label: 'Close launcher', description: 'Pressing Escape always closes the launcher (default)' },
      { value: 'go-back', label: 'Go back', description: 'Pressing Escape while a view is open navigates back instead of closing the launcher' },
    ]}
    value={handler.settings.general.escapeInViewBehavior || 'close-window'}
    onchange={(v) => handler.updateEscapeBehavior(v as 'go-back' | 'close-window')}
    noBorder
  />

  {#if handler.saveError && handler.saveMessage}
    <div class="mt-4 pb-4 text-sm font-medium px-6" style="color: var(--accent-danger)">
      {handler.saveMessage}
    </div>
  {/if}
</SettingsSection>

<SettingsSection title="Global Shortcut">
  <div class="mb-8 p-6 pt-2">
    <div class="mb-2 font-medium text-[var(--text-primary)]">Asyar activation shortcut</div>
    <div class="text-sm mb-6 text-[var(--text-secondary)]">
      This shortcut will show or hide Asyar from anywhere on your system
    </div>

    <div class="mb-6">
      <ShortcutRecorder
        bind:modifier={handler.selectedModifier}
        bind:key={handler.selectedKey}
        placeholder="Click to set shortcut"
        disabled={handler.isSaving}
        onsave={handleSave}
        {conflictChecker}
      />
    </div>
  </div>
</SettingsSection>

<SettingsSection title="Appearance">
  <div class="mb-8 p-6">
    <div class="mb-3 font-medium text-center text-[var(--text-primary)]">App Theme</div>
    <div class="flex justify-center gap-6">
      <label class="flex flex-col items-center cursor-pointer">
        <div class="w-36 h-32 rounded-xl border-2 {handler.selectedTheme === 'system' ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'} bg-gradient-to-r from-[#f8f9fa] to-[#212529] mb-2 flex items-center justify-center shadow-sm overflow-hidden">
          <div class="w-full h-full flex items-center justify-center" style="background: linear-gradient(to right, #f8f9fa, #212529);">
            <span class="font-medium" style="color: var(--text-primary)">System</span>
          </div>
        </div>
        <input type="radio" name="theme" value="system" checked={handler.selectedTheme === 'system'} onchange={() => handler.updateThemeSetting('system')} class="sr-only">
        <div class="text-sm mt-1 text-[var(--text-secondary)]">System</div>
      </label>

      <label class="flex flex-col items-center cursor-pointer">
        <div class="w-36 h-32 rounded-xl border-2 {handler.selectedTheme === 'light' ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'} mb-2 flex items-center justify-center shadow-sm overflow-hidden" style="background: #f8f9fa;">
          <span class="font-medium" style="color: #212529;">Light</span>
        </div>
        <input type="radio" name="theme" value="light" checked={handler.selectedTheme === 'light'} onchange={() => handler.updateThemeSetting('light')} class="sr-only">
        <div class="text-sm mt-1 text-[var(--text-secondary)]">Light</div>
      </label>

      <label class="flex flex-col items-center cursor-pointer">
        <div class="w-36 h-32 rounded-xl border-2 {handler.selectedTheme === 'dark' ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'} mb-2 flex items-center justify-center shadow-sm overflow-hidden" style="background: #212529;">
          <span class="font-medium" style="color: #f8f9fa;">Dark</span>
        </div>
        <input type="radio" name="theme" value="dark" checked={handler.selectedTheme === 'dark'} onchange={() => handler.updateThemeSetting('dark')} class="sr-only">
        <div class="text-sm mt-1 text-[var(--text-secondary)]">Dark</div>
      </label>
    </div>
  </div>
</SettingsSection>

<SettingsSection title="Window Mode">
  <div class="mb-8 p-6">
    <div class="flex justify-center gap-6">
      <label class="flex flex-col items-center cursor-pointer">
        <div
          class="w-40 h-32 rounded-xl border-2 p-4 flex items-start justify-center {handler.selectedLaunchView === 'default' ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'}"
          style="background: var(--bg-tertiary);"
        >
          <div class="w-24 rounded-lg overflow-hidden" style="background: var(--bg-secondary); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
            <div class="h-5 flex items-center px-2.5" style="border-bottom: 1px solid var(--border-color);">
              <div class="h-2 w-12 rounded-sm" style="background: var(--bg-hover);"></div>
            </div>
            <div class="px-2.5 py-1.5 flex flex-col gap-1">
              <div class="h-2.5 rounded-sm" style="background: var(--bg-selected);"></div>
              <div class="h-2.5 rounded-sm" style="background: var(--bg-hover);"></div>
              <div class="h-2.5 rounded-sm" style="background: var(--bg-hover);"></div>
            </div>
            <div class="h-4 flex items-center justify-end gap-1 px-2" style="border-top: 1px solid var(--border-color);">
              <div class="h-1 w-1 rounded-full" style="background: var(--border-color);"></div>
              <div class="h-1 w-1 rounded-full" style="background: var(--border-color);"></div>
            </div>
          </div>
        </div>
        <input type="radio" name="launchView" value="default" checked={handler.selectedLaunchView === 'default'} onchange={() => selectLaunchView('default')} class="sr-only">
        <div class="text-sm mt-2 text-[var(--text-secondary)]">Default</div>
      </label>

      <label class="flex flex-col items-center cursor-pointer">
        <div
          class="w-40 h-32 rounded-xl border-2 p-4 flex items-start justify-center {handler.selectedLaunchView === 'compact' ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'}"
          style="background: var(--bg-tertiary);"
        >
          <div class="w-24 rounded-lg overflow-hidden" style="background: var(--bg-secondary); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
            <div class="h-5 flex items-center px-2.5">
              <div class="h-2 w-12 rounded-sm" style="background: var(--bg-hover);"></div>
            </div>
            <div class="h-4 flex items-center justify-end px-2" style="border-top: 1px solid var(--border-color);">
              <div class="h-1 w-1 rounded-full" style="background: var(--border-color);"></div>
            </div>
          </div>
        </div>
        <input type="radio" name="launchView" value="compact" checked={handler.selectedLaunchView === 'compact'} onchange={() => selectLaunchView('compact')} class="sr-only">
        <div class="text-sm mt-2 text-[var(--text-secondary)]">Compact</div>
      </label>
    </div>
  </div>
</SettingsSection>

{#if themeExtensions.length > 0}
<SettingsSection title="Custom Themes">
  <div class="p-6">
    <div class="grid gap-3">
      <label class="flex items-center p-3 rounded-lg cursor-pointer border-2 {activeThemeId === null ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'}" style="background: var(--bg-secondary);">
        <input type="radio" name="custom-theme" checked={activeThemeId === null} onchange={() => selectTheme(null)} class="sr-only">
        <div>
          <div class="font-medium text-sm text-[var(--text-primary)]">Default</div>
          <div class="text-xs text-[var(--text-secondary)]">Built-in Asyar theme</div>
        </div>
      </label>

      {#each themeExtensions as theme}
        <label class="flex items-center p-3 rounded-lg cursor-pointer border-2 {activeThemeId === theme.id ? 'border-[var(--accent-primary)]' : 'border-transparent hover:border-[var(--border-color)]'}" style="background: var(--bg-secondary);">
          <input type="radio" name="custom-theme" checked={activeThemeId === theme.id} onchange={() => selectTheme(theme.id)} class="sr-only">
          <div class="flex-1">
            <div class="font-medium text-sm text-[var(--text-primary)]">{theme.name}</div>
            <div class="text-xs text-[var(--text-secondary)]">
              {#if theme.author}{theme.author} &middot; {/if}v{theme.version}
            </div>
          </div>
        </label>
      {/each}
    </div>
  </div>
</SettingsSection>
{/if}
