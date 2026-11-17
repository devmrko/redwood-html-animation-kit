import type { PresentationTrack } from './presentation-timeline.js';

export interface PresentationEvent { at: number; text: string }
export interface PresentationTiming { duration: number; events: PresentationEvent[] }

/** Conservative editing heuristic; callers can display and override it. */
export function estimatePresentationMinimum(context: { content: string; events: readonly PresentationEvent[]; animationDuration: number; elementCount: number; stepCount?: number }): number {
  const length = Array.from(context.content.replace(/\s/g, '')).length;
  const lastEvent = Math.max(0, ...context.events.map(event => event.at + Math.max(1.5, Math.min(6, Array.from(event.text.replace(/\s/g, '')).length / 12 + .6))));
  return Math.ceil(Math.max(3, length / 14 + 2, context.elementCount * .7 + 2, (context.stepCount ?? 0) * 3 + 1, context.animationDuration + 1, lastEvent) * 10) / 10;
}

export function describePresentationStructure(root: HTMLElement): { elementCount: number; stepCount: number } {
  const selectors = '.card,.source-card,.depth-layer,.chart-panel,.effect-card,[data-effect-play],li,table tr,svg text';
  const elementCount = root.querySelectorAll(selectors).length;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-s]')].map(el => Number(el.dataset.s));
  const stepCount = Math.max(0, Number(root.dataset.steps) || 0, ...steps.filter(value => Number.isFinite(value) && value >= 0 && value <= 100));
  return { elementCount, stepCount: Math.min(100, stepCount) };
}

/** Derive entrance times from the same keyframes used by the animation player. Seconds. */
export function describePresentationTracks(duration: number, tracks: readonly PresentationTrack[]): PresentationTiming {
  const events: PresentationEvent[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    const text = (track.element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    const frames = track.keyframes;
    const visible = frames.findIndex(frame => frame.opacity !== undefined && Number(frame.opacity) > 0);
    if (!text || visible < 0) continue;
    const frame = frames[Math.max(0, visible - 1)]!;
    const at = Math.round((frame.offset ?? 0) * duration) / 1000;
    const key = `${at}:${text}`;
    if (!seen.has(key)) { events.push({ at, text }); seen.add(key); }
  }
  return { duration: duration / 1000, events: events.sort((a, b) => a.at - b.at).slice(0, 80) };
}

/** Collect source content without relying on the current animation visibility. */
export function extractPresentationContent(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('script,style,button,.slide-footer,.foot,.notes,aside[data-notes],[aria-hidden="true"]').forEach(el => el.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 12000);
}
