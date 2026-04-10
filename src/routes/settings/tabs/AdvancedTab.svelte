<script lang="ts">
  import {
    SettingsSection,
    SettingsRow,
    SettingsRangeSlider,
    Toggle,
    SegmentedControl,
  } from '../../../components';
  import type { SettingsHandler } from '../settingsHandlers.svelte';
  import { settingsService } from '../../../services/settings/settingsService.svelte';
  import ScheduledTasksSection from '../../../components/settings/ScheduledTasksSection.svelte';
  import { snippetService, enabledPersistence } from '../../../built-in-features/snippets/snippetService';

  let {
    handler,
  }: {
    handler: SettingsHandler;
  } = $props();

  let snippetsEnabled = $state(enabledPersistence.loadSync(true));
  let snippetsToggleError = $state<string | null>(null);

  async function toggleSnippets() {
    const desiredState = !snippetsEnabled;
    const result = await snippetService.setEnabled(desiredState);
    if (result.ok) {
      snippetsEnabled = desiredState;
      enabledPersistence.save(snippetsEnabled);
      snippetsToggleError = null;
    } else {
      snippetsToggleError = result.error || 'Failed to change expansion setting';
    }
  }

  let autoUpdate = $derived(
    settingsService.currentSettings.extensions?.autoUpdate !== false,
  );

  async function toggleAutoUpdate() {
    const newValue = !autoUpdate;
    await settingsService.updateSettings('extensions', {
      ...settingsService.currentSettings.extensions,
      autoUpdate: newValue,
    });
  }

  let escapeValue = $state<'close-window' | 'go-back'>('close-window');
  $effect(() => {
    escapeValue = (handler.settings.general.escapeInViewBehavior ?? 'close-window') as 'close-window' | 'go-back';
  });
  $effect(() => {
    const current = handler.settings.general.escapeInViewBehavior ?? 'close-window';
    if (escapeValue !== current) {
      handler.updateEscapeBehavior(escapeValue);
    }
  });
</script>

<SettingsSection title="Search">
  <SettingsRow
    label="Extension results in search"
    description="Allow extensions to contribute results in the search bar"
    noBorder
  >
    <Toggle
      checked={handler.settings.search.enableExtensionSearch}
      onchange={() => handler.handleExtensionSearchToggle()}
    />
  </SettingsRow>
</SettingsSection>

<SettingsSection title="Behavior">
  <SettingsRow
    label="Escape key behavior"
    description="What happens when you press Escape while a view is open"
    noBorder
  >
    <SegmentedControl
      options={[
        { value: 'close-window', label: 'Close launcher' },
        { value: 'go-back', label: 'Go back' },
      ]}
      bind:value={escapeValue}
    />
  </SettingsRow>
</SettingsSection>

<SettingsSection title="Extensions">
  <SettingsRow
    label="Automatic Updates"
    description="Extensions update silently in the background"
    noBorder
  >
    <Toggle checked={autoUpdate} onchange={toggleAutoUpdate} />
  </SettingsRow>
</SettingsSection>

<ScheduledTasksSection />

<SettingsSection title="Built-in Feature Settings">
  <SettingsRow
    label="Calculator: Currency Refresh Interval"
    description="How often to update exchange rates in the background (hours)"
  >
    <SettingsRangeSlider
      min={1} max={24} step={1}
      value={handler.settings.calculator?.refreshInterval || 6}
      suffix="h"
      onchange={(v) => handler.updateCalculatorRefreshInterval(v)}
    />
  </SettingsRow>
  <SettingsRow
    label="Background Expansion"
    description="Automatically expand text snippets as you type. Requires Accessibility permission on macOS."
    noBorder
  >
    <Toggle checked={snippetsEnabled} onchange={toggleSnippets} />
  </SettingsRow>
  {#if snippetsToggleError}
    <div style="padding: 0 0 var(--space-4); font-size: var(--font-size-sm); color: var(--accent-danger);">{snippetsToggleError}</div>
  {/if}
</SettingsSection>

{#if handler.saveError && handler.saveMessage}
  <div class="error-message">{handler.saveMessage}</div>
{/if}

<style>
  .error-message {
    padding: var(--space-3) var(--space-6);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--accent-danger);
  }
</style>
