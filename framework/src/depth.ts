/** Opt-in DOM depth effects. Importing this module has no DOM side effects. */
export interface DepthLayer { element: HTMLElement; depth: number }
export interface DepthSceneOptions {
  root: HTMLElement;
  scene: HTMLElement;
  layers: readonly DepthLayer[];
  tilt?: number;
  perspective?: number;
  interactive?: boolean;
}
export interface DepthScene {
  setEnabled(enabled: boolean): void;
  focus(index: number | null): void;
  play(): void;
  settle(): void;
  destroy(): void;
}

export function createDepthScene(options: DepthSceneOptions): DepthScene {
  const { root, scene, layers, tilt = 4, perspective = 1800, interactive = true } = options;
  if (!Number.isFinite(tilt) || tilt < 0 || tilt > 12 ||
      !Number.isFinite(perspective) || perspective < 500 || perspective > 5000 ||
      layers.some(layer => !Number.isFinite(layer.depth) || Math.abs(layer.depth) > 150)) {
    throw new RangeError('Depth scene values are outside supported ranges');
  }
  if (!root.contains(scene) || layers.length === 0 ||
      layers.some(layer => layer.element === scene || !scene.contains(layer.element)) ||
      new Set(layers.map(layer => layer.element)).size !== layers.length) {
    throw new TypeError('Provide a contained scene and unique child layers');
  }
  const view = root.ownerDocument.defaultView;
  if (!view) throw new TypeError('Depth scene requires a browser document');
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = view.matchMedia('(hover: hover) and (pointer: fine)');
  const saved = [root, scene, ...layers.map(layer => layer.element)].map(element => ({
    element, transform: element.style.transform, transformStyle: element.style.transformStyle,
    perspective: element.style.perspective,
  }));
  let enabled = true;
  let destroyed = false;
  let focused: number | null = null;
  let x = 0;
  let y = 0;
  let animations: Animation[] = [];
  root.style.perspective = `${perspective}px`;
  scene.style.transformStyle = 'preserve-3d';
  for (const { element } of layers) element.style.transformStyle = 'preserve-3d';

  function draw(): void {
    if (destroyed) return;
    const active = enabled && !reduced.matches;
    const angle = focused === null ? tilt : tilt * 0.2;
    scene.style.transform = active
      ? `rotateX(${2 - y * angle}deg) rotateY(${-3 + x * angle}deg)`
      : 'none';
    layers.forEach(({ element, depth }, index) => {
      const lift = focused === index ? 75 : 0;
      element.style.transform = enabled
        ? `translate3d(${active ? x * depth * 0.12 : 0}px, ${active ? y * depth * 0.08 : 0}px, ${depth + lift}px)`
        : 'none';
    });
  }
  function settle(): void {
    for (const animation of animations) animation.cancel();
    animations = [];
  }
  function reset(): void { x = y = 0; draw(); }
  function onPointer(event: PointerEvent): void {
    if (!fine.matches || reduced.matches || !enabled || event.pointerType === 'touch') return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    draw();
  }
  function onReduced(): void { settle(); reset(); }
  function onVisibility(): void { if (root.ownerDocument.hidden) { settle(); reset(); } }
  if (interactive) {
    root.addEventListener('pointermove', onPointer);
    root.addEventListener('pointerleave', reset);
  }
  reduced.addEventListener('change', onReduced);
  root.ownerDocument.addEventListener('visibilitychange', onVisibility);
  draw();
  return {
    setEnabled(value) { if (!destroyed) { enabled = value; settle(); reset(); } },
    focus(index) {
      if (destroyed) return;
      if (index !== null && (!Number.isInteger(index) || index < 0 || index >= layers.length)) {
        throw new RangeError('Invalid depth layer index');
      }
      focused = index;
      draw();
    },
    play() {
      if (destroyed) return;
      settle();
      focused = null;
      reset();
      if (reduced.matches || root.ownerDocument.hidden) return;
      for (const [index, { element }] of layers.entries()) {
        if (typeof element.animate !== 'function') continue;
        animations.push(element.animate([
          { opacity: 0, translate: '0 36px' }, { opacity: 1, translate: '0 0' },
        ], { duration: 800, delay: index * 240, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
      }
    },
    settle,
    destroy() {
      if (destroyed) return;
      settle();
      root.removeEventListener('pointermove', onPointer);
      root.removeEventListener('pointerleave', reset);
      reduced.removeEventListener('change', onReduced);
      root.ownerDocument.removeEventListener('visibilitychange', onVisibility);
      for (const { element, transform, transformStyle, perspective } of saved) {
        element.style.transform = transform;
        element.style.transformStyle = transformStyle;
        element.style.perspective = perspective;
      }
      destroyed = true;
    },
  };
}
