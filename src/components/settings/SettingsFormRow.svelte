<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    separator = false,
    children,
  }: {
    label: string;
    separator?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="form-row" class:separator>
  <div class="row-label">{label}</div>
  <div class="row-control">
    {@render children()}
  </div>
</div>

<style>
  .form-row {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-6);
    border-bottom: 1px solid var(--separator);
    gap: var(--space-6);
  }

  .form-row:last-child {
    border-bottom: none;
  }

  .form-row.separator {
    border-top: 1px solid var(--separator);
    padding-top: var(--space-4);
  }

  .row-label {
    width: 9rem;
    text-align: right;
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
    font-family: var(--font-ui);
  }

  .row-control {
    flex: 1;
    min-width: 0;
  }
</style>
