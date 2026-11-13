import type { FlowPoint } from './presentation-flow.js';
import type { PresentationState, PresentationTimeline } from './presentation-timeline.js';

export interface AnimeHandle {
  duration: number;
  currentTime: number;
  add(target: object | readonly object[], parameters: Record<string, unknown>, position?: number): AnimeHandle;
  play(): unknown;
  pause(): unknown;
  seek(time: number): unknown;
  complete(): unknown;
  revert(): unknown;
}
export interface PresentationAnimeEngine {
  createTimeline(parameters: Record<string, unknown>): AnimeHandle;
  svg: {
    createDrawable(target: Element): object[];
    createMotionPath(path: Element): Record<string, unknown>;
    morphTo(target: Element): unknown;
  };
}
export type RichEffectKind = 'text-characters' | 'text-words' | 'text-lines' | 'typewriter' | 'scramble' |
  'text-wave' | 'line-draw' | 'line-flow' | 'shape-morph' | 'path-follow' | 'orbit' | 'check-draw' |
  'count-up' | 'count-down' | 'progress' | 'radial-progress' | 'reorder' | 'card-expand';
export interface RichEffectSpec {
  kind: RichEffectKind;
  target: Element;
  start: number;
  duration: number;
  path?: Element;
  targetPath?: Element;
  value?: number;
  layout?: readonly { element: HTMLElement; from: FlowPoint; to: FlowPoint }[];
  detail?: Element;
}
export interface RichPresentationOptions {
  root: HTMLElement;
  engine: PresentationAnimeEngine;
  duration: number;
  effects: readonly RichEffectSpec[];
  onStateChange?: (state: PresentationState) => void;
}

/** Optional Anime.js recipes, with the same playback port as native tracks. */
export function createRichPresentation(options: RichPresentationOptions): PresentationTimeline {
  const { root, engine, duration, effects, onStateChange } = options;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view || !Number.isFinite(duration) || duration <= 0 || !effects.length) throw new RangeError('Invalid rich presentation');
  const kinds: readonly string[] = ['text-characters', 'text-words', 'text-lines', 'typewriter', 'scramble', 'text-wave',
    'line-draw', 'line-flow', 'shape-morph', 'path-follow', 'orbit', 'check-draw', 'count-up', 'count-down',
    'progress', 'radial-progress', 'reorder', 'card-expand'];
  for (const effect of effects) {
    if (!kinds.includes(effect.kind)) throw new RangeError('Unsupported rich effect');
    if (!root.contains(effect.target) || !Number.isFinite(effect.start) || effect.start < 0 ||
        !Number.isFinite(effect.duration) || effect.duration <= 0 || effect.start + effect.duration > duration ||
        (effect.value !== undefined && !Number.isFinite(effect.value))) throw new RangeError('Invalid effect target or timing');
    for (const extra of [effect.path, effect.targetPath, effect.detail]) {
      if (extra && !root.contains(extra)) throw new TypeError('Effect elements must be contained');
    }
    if (effect.layout?.some(item => !root.contains(item.element) ||
        ![item.from.x, item.from.y, item.to.x, item.to.y].every(Number.isFinite))) throw new TypeError('Invalid layout positions');
  }
  const attributes = ['style', 'd', 'pathLength', 'stroke-dasharray', 'stroke-dashoffset', 'transform', 'aria-label'];
  const snapshots = new Map<Element, { attrs: (string | null)[]; nodes: Node[] }>();
  function capture(element: Element): void {
    if (!snapshots.has(element)) snapshots.set(element, {
      attrs: attributes.map(name => element.getAttribute(name)), nodes: [...element.childNodes],
    });
  }
  let state: PresentationState = 'idle';
  function emit(next: PresentationState): void { if (state !== next) { state = next; onStateChange?.(next); } }
  const timeline = engine.createTimeline({ autoplay: false,
    onComplete() { if (state === 'running') emit('finished'); } });
  function cleanup(): void {
    try { timeline.revert(); } finally {
      snapshots.forEach(({ attrs, nodes }, element) => {
        attributes.forEach((name, index) => {
          const value = attrs[index];
          if (value === null || value === undefined) element.removeAttribute(name); else element.setAttribute(name, value);
        });
        element.replaceChildren(...nodes);
      });
    }
  }
  try {
    timeline.add({ clock: 0 }, { clock: 1, duration, ease: 'linear' }, 0);
    for (const spec of effects) {
      const { target, kind, start, duration: length } = spec;
      capture(target);
      const add = (object: object | readonly object[], parameters: Record<string, unknown>, offset = start): void => {
        timeline.add(object, { duration: length, ease: 'out(3)', ...parameters }, offset);
      };
      if (kind.startsWith('text-')) {
        const original = target.textContent ?? '';
        const units = kind === 'text-words' ? original.match(/\S+\s*/gu) ?? [] :
          kind === 'text-lines' ? original.split('\n') :
          [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(original)].map(unit => unit.segment);
        target.setAttribute('aria-label', original);
        const spans = units.map(unit => {
          const span = doc.createElement('span'); span.textContent = unit;
          span.style.display = kind === 'text-lines' ? 'block' : 'inline-block';
          span.style.whiteSpace = 'pre'; span.setAttribute('aria-hidden', 'true'); return span;
        });
        target.replaceChildren(...spans);
        add(spans, {
          opacity: kind === 'text-wave' ? [1, 1] : [0, 1],
          y: kind === 'text-wave' ? [0, -16, 0] : [20, 0],
          duration: length * 0.6,
          delay: (_element: unknown, index: number) => index * length * 0.4 / Math.max(1, spans.length - 1),
        });
        continue;
      }
      switch (kind) {
        case 'typewriter':
        case 'scramble': {
          const original = target.textContent ?? '';
          const chars = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(original)].map(unit => unit.segment);
          const counter = { value: 0 };
          add(counter, { value: [0, chars.length], ease: 'linear', onUpdate() {
            const revealed = Math.floor(counter.value);
            target.textContent = chars.map((char, index) => index < revealed ? char :
              kind === 'typewriter' ? '' : 'ABC123XYZ'[(index + revealed) % 9]).join('');
          } });
          break;
        }
        case 'line-draw':
        case 'check-draw': add(engine.svg.createDrawable(target), { draw: ['0 0', '0 1'], ease: 'inOut(2)' }); break;
        case 'line-flow':
          target.setAttribute('pathLength', '1'); target.setAttribute('stroke-dasharray', '.08 .12');
          add(target, { strokeDashoffset: [1, 0], ease: 'linear' }); break;
        case 'shape-morph':
          if (!spec.targetPath) throw new TypeError('Morph requires a destination path');
          add(target, { d: engine.svg.morphTo(spec.targetPath), ease: 'inOut(2)' }); break;
        case 'path-follow':
          if (!spec.path) throw new TypeError('Motion requires a path');
          add(target, { ...engine.svg.createMotionPath(spec.path), ease: 'linear' }); break;
        case 'orbit': add(target, { rotate: [0, 360], ease: 'linear' }); break;
        case 'count-up':
        case 'count-down': {
          const value = spec.value ?? 1280;
          const counter = { value: kind === 'count-down' ? value : 0 };
          add(counter, { value: kind === 'count-down' ? 0 : value, onUpdate() {
            target.textContent = Math.round(counter.value).toLocaleString('ko-KR');
          } }); break;
        }
        case 'progress':
          (target as HTMLElement).style.transformOrigin = 'left center';
          add(target, { scaleX: [0, 1] }); break;
        case 'radial-progress':
          target.setAttribute('pathLength', '1'); target.setAttribute('stroke-dasharray', '1');
          add(target, { strokeDashoffset: [1, 0.25] }); break;
        case 'reorder':
          if (!spec.layout?.length) throw new TypeError('Reorder requires positions');
          for (const item of spec.layout) {
            capture(item.element); add(item.element, { x: [item.from.x, item.to.x], y: [item.from.y, item.to.y] });
          } break;
        case 'card-expand':
          add(target, { width: [120, 260], height: [46, 110], borderRadius: [8, 15] });
          if (spec.detail) { capture(spec.detail); add(spec.detail, { opacity: [0, 1], duration: length * 0.5 }, start + length * 0.5); }
          break;
        default: throw new RangeError('Unsupported rich effect');
      }
    }
    timeline.pause(); timeline.seek(0);
  } catch (error) { cleanup(); throw error; }
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  function finish(): void { if (state !== 'destroyed') { timeline.complete(); emit('finished'); } }
  function pause(): void { if (state === 'running') { timeline.pause(); emit('paused'); } }
  function play(): void {
    if (state === 'destroyed' || state === 'running') return;
    if (reduced.matches) { finish(); return; }
    if (doc.hidden) return;
    if (state === 'finished') timeline.seek(0);
    emit('running'); timeline.play();
  }
  function visibility(): void { if (doc.hidden) pause(); }
  function preference(): void { if (reduced.matches) finish(); }
  doc.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', preference);
  return {
    get state() { return state; }, get currentTime() { return timeline.currentTime; }, play, pause, finish,
    restart() { if (state !== 'destroyed') { timeline.pause(); timeline.seek(0); emit('idle'); play(); } },
    destroy() {
      if (state === 'destroyed') return;
      timeline.pause();
      doc.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', preference);
      try { cleanup(); } finally { emit('destroyed'); }
    },
  };
}
