<script lang="ts">
  import {
    SettingsSection,
    SettingsRow,
    Toggle,
    SegmentedControl,
  } from '../../../components';
  import type { SettingsHandler } from '../settingsHandlers.svelte';
  import { settingsService } from '../../../services/settings/settingsService.svelte';
  import ScheduledTasksSection from '../../../components/settings/ScheduledTasksSection.svelte';

  let {
    handler,
  }: {
    handler: SettingsHandler;
  } = $props();

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
