export interface PresentationWindowRequest { slide: string; width: number; height: number; left: number; top: number; project?: string }
/** The application supplies the native launch adapter; this module has no HTTP route dependency. */
export function createPresentationWindowControl(options: {
  button: HTMLButtonElement;
  request: () => PresentationWindowRequest;
  launch: (request: PresentationWindowRequest) => Promise<void>;
  onState: (state: 'opening' | 'opened' | 'failed', error?: unknown) => void;
}): { open(): Promise<void>; destroy(): void } {
  let busy = false, destroyed = false;
  async function open(): Promise<void> {
    if (busy || destroyed) return;
    busy = true; options.button.disabled = true; options.onState('opening');
    try { await options.launch(options.request()); if (!destroyed) options.onState('opened'); }
    catch (error) { if (!destroyed) options.onState('failed', error); }
    finally { busy = false; if (!destroyed) options.button.disabled = false; }
  }
  const click = (): void => { void open(); };
  options.button.addEventListener('click', click);
  return { open, destroy() { destroyed = true; options.button.removeEventListener('click', click); options.button.disabled = false; } };
}
