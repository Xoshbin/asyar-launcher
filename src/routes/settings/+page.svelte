<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    LoadingState,
    DialogHost,
    SettingsTopBar
  } from '../../components';
  import { SettingsHandler } from './settingsHandlers.svelte';
  import GeneralTab from './tabs/GeneralTab.svelte';
  import ExtensionsTab from './tabs/ExtensionsTab.svelte';
  import AboutTab from './tabs/AboutTab.svelte';
  import BackupTab from './tabs/BackupTab.svelte';
  import AccountTab from './tabs/AccountTab.svelte';
  import AdvancedTab from './tabs/AdvancedTab.svelte';
  import { authService } from '../../services/auth/authService.svelte';
import { registerProfileProviders } from '../../services/appInitializer';
import { cloudSyncService } from '../../services/sync/cloudSyncService.svelte';
import { shortcutStore } from '../../built-in-features/shortcuts/shortcutStore.svelte';
import { initValidKeys } from '../../built-in-features/shortcuts/shortcutFormatter';


  import '../../resources/styles/style.css';

  const handler = new SettingsHandler();

  const settingsTabs = [
    { id: 'general', label: 'General', icon: 'settings' },
    { id: 'extensions', label: 'Extensions', icon: 'puzzle' },
    { id: 'backup', label: 'Backup', icon: 'cloud-upload' },
    { id: 'account', label: 'Account', icon: 'user' },
    { id: 'advanced', label: 'Advanced', icon: 'layers' },
    { id: 'about', label: 'About', icon: 'info' },
  ];

  onMount(async () => {
    handler.init();
    // Trade-off: Settings is a separate Tauri webview with its own JS context.
    // authService/cloudSyncService are re-initialized here because they are
    // per-context singletons. Rust AuthState is the single source of truth;
    // both windows hydrate from it. Changes in one window don't auto-propagate
    // to the other — acceptable because the settings window is short-lived.
    await authService.init();
    await shortcutStore.init(); // load item shortcuts so conflict checker works
    await initValidKeys();
    registerProfileProviders(); // needed for sync operations in settings window
    cloudSyncService.checkStatus().catch(() => {}); // populate lastSyncedAt display
  });


  onDestroy(() => {
    handler.destroy();
  });
</script>

<svelte:head>
  <title>Asyar Settings</title>
</svelte:head>

{#if handler.isLoading}
  <div class="flex items-center justify-center h-screen">
    <LoadingState message="Loading settings..." />
  </div>
{:else}
  <div class="settings-page">
    <header class="settings-header">
      {#if handler.initError}
        <div class="p-2 text-center" style="background: color-mix(in srgb, var(--accent-warning) 15%, var(--bg-primary)); color: var(--text-primary);">
          ⚠️ {handler.initError}
        </div>
      {/if}
      <SettingsTopBar tabs={settingsTabs} bind:activeTab={handler.activeTab} />
    </header>

    <main class="settings-content custom-scrollbar">
      <div class="settings-content-inner">
        {#if handler.activeTab === 'general'}
          <GeneralTab {handler} />
        {:else if handler.activeTab === 'extensions'}
          <ExtensionsTab {handler} />
        {:else if handler.activeTab === 'backup'}
          <BackupTab {handler} />
        {:else if handler.activeTab === 'account'}
          <AccountTab {handler} />
        {:else if handler.activeTab === 'advanced'}
          <AdvancedTab {handler} />
        {:else if handler.activeTab === 'about'}
          <AboutTab {handler} />
        {/if}
      </div>
    </main>
  </div>
{/if}

<DialogHost />

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .settings-header {
    flex-shrink: 0;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-8) var(--space-6);
  }

  .settings-content-inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
</style>
