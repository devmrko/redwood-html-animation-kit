import { createPresentationGallery } from '../vendor/foundation/presentation-gallery.js';
import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';
import { createEffectTrack, createStaggerTracks } from '../vendor/foundation/presentation-effects.js';

export function createEffectsSlide(root, onStateChange) {
  const pick = id => root.querySelector(`#${id}`);
  const effect = (element, name, start, duration, totalDuration) => createEffectTrack({
    element, effect: name, start, duration, totalDuration,
  });
  const examples = [
    { id: 'entrance', at: 1000, length: 1200, tracks(start, total) { return [
      effect(pick('preset-fade'), 'fade-in', start, 900, total),
      effect(pick('preset-rise'), 'rise', start, 900, total),
    ]; } },
    { id: 'exit', at: 2600, length: 1000, tracks(start, total) {
      return [effect(pick('preset-exit'), 'fade-out', start, 700, total)];
    } },
    { id: 'stagger', at: 3800, length: 1400, tracks(start, totalDuration) {
      return createStaggerTracks({ elements: [...root.querySelectorAll('.stagger-item')],
        effect: 'rise', start, duration: 650, stagger: 220, totalDuration });
    } },
    { id: 'highlight', at: 5500, length: 1700, tracks(start, total) {
      return [effect(pick('preset-highlight'), 'highlight', start, 1400, total)];
    } },
    { id: 'pulse', at: 7600, length: 1500, tracks(start, total) {
      return [effect(pick('preset-pulse'), 'pulse', start, 1100, total)];
    } },
    { id: 'expand', at: 9300, length: 1400, tracks(start, total) {
      return [effect(pick('preset-expand'), 'expand', start, 1000, total)];
    } },
  ];
  const player = createPresentationGallery({
    root, onStateChange,
    createOverall: notify => createPresentationTimeline({ duration: 12000,
      tracks: examples.flatMap(example => example.tracks(example.at, 12000)), onStateChange: notify }),
    examples: examples.map(example => ({ trigger: root.querySelector(`[data-effect-play="${example.id}"]`),
      create: notify => createPresentationTimeline({ duration: example.length,
        tracks: example.tracks(0, example.length), onStateChange: notify }),
    })),
  });
  return { player, destroy() { player.destroy(); } };
}
