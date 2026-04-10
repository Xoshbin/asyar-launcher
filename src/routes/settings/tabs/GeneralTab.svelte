<script lang="ts">
  import { SettingsSection, SettingsRow, Toggle, SettingsRadioGroup } from '../../../components';
  import type { SettingsHandler } from '../settingsHandlers.svelte';

  let {
    handler,
  }: {
    handler: SettingsHandler;
  } = $props();
</script>

<SettingsSection title="Startup Settings">
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
    onchange={(v) => handler.updateEscapeBehavior(v as "go-back" | "close-window")}
    noBorder
  />
  
  {#if handler.saveError && handler.saveMessage}
    <div class="mt-4 pb-4 text-sm font-medium px-6" style="color: var(--accent-danger)">
      {handler.saveMessage}
    </div>
  {/if}
</SettingsSection>
