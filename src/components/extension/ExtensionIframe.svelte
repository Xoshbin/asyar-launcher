<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { logService } from '../../services/log/logService';
  import { RemoteBridge, BridgeMessageType, type BridgeMessage } from 'asyar-api';
  import { ExtensionBridge, ExtensionContext } from 'asyar-api';

  export let path: string;
  export let html: string = ''; // The wrapper HTML
  export let extensionId: string;

  let iframe: HTMLIFrameElement;

  async function handleMessage(message: BridgeMessage) {
    switch (message.type) {
      case BridgeMessageType.LOG:
        logService.info(`[Extension:${extensionId}] ${message.payload}`);
        break;
      case BridgeMessageType.SERVICE_CALL:
        const { service, method, args } = message.payload;
        try {
          const bridge = ExtensionBridge.getInstance();
          let targetService: any;
          
          if (service === 'ExtensionBridge') {
            targetService = bridge;
          } else {
            targetService = bridge.getServices()[service];
          }

          if (targetService && typeof targetService[method] === 'function') {
            const result = await targetService[method](...args);
            if (message.callId) {
              RemoteBridge.respond(message.callId, result);
            }
          } else {
            throw new Error(`Service ${service} or method ${method} not found`);
          }
        } catch (err) {
          logService.error(`Bridge error: ${err}`);
          if (message.callId) {
            RemoteBridge.respond(message.callId, null, String(err));
          }
        }
        break;
    }
  }

  onMount(() => {
    // We can't use RemoteBridge.init because it adds a global listener
    // We want a listener scoped to this iframe for security if possible,
    // but window 'message' is global. We filter by source.
    
    const listener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      handleMessage(event.data);
    };

    window.addEventListener('message', listener);
    
    return () => {
      window.removeEventListener('message', listener);
    };
  });
</script>

<iframe
  bind:this={iframe}
  title="Extension View"
  srcdoc={html}
  class="w-full h-full border-none bg-transparent"
  sandbox="allow-scripts allow-forms allow-popups"
></iframe>

<style>
  iframe {
    background: transparent;
  }
</style>
