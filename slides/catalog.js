import * as anime from '../vendor/anime/anime.esm.min.js';
import { createPresentationGallery } from '../vendor/foundation/presentation-gallery.js';
import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';
import { createEffectTrack } from '../vendor/foundation/presentation-effects.js';
import { createRichPresentation } from '../vendor/foundation/presentation-recipes.js';

export function createCatalogSlide(root, onStateChange) {
  const pick = id => root.querySelector(`#${id}`);
  const definitions = {
    'motion-effects': [['zoom', 'zoom'], ['bounce', 'bounce'], ['flip', 'flip'], ['rotate', 'rotate'], ['rubber', 'rubber-band'], ['shake', 'shake']],
    'text-effects': [['characters', 'text-characters'], ['words', 'text-words'], ['lines', 'text-lines'], ['typewriter', 'typewriter'], ['scramble', 'scramble'], ['wave', 'text-wave']],
    'svg-effects': [['draw', 'line-draw'], ['lineflow', 'line-flow'], ['morph', 'shape-morph'], ['path', 'path-follow'], ['orbit', 'orbit'], ['check', 'check-draw']],
    'metric-effects': [['countup', 'count-up'], ['countdown', 'count-down'], ['progress', 'progress'], ['radial', 'radial-progress'], ['reorder', 'reorder'], ['cardexpand', 'card-expand']],
  }[root.id];
  const native = root.id === 'motion-effects';
  const effects = definitions.map(([id, kind], index) => {
    const spec = { id, kind, target: pick(`demo-${id}`), start: 900 + index * 2100, duration: 1400 };
    if (kind === 'shape-morph') spec.targetPath = pick('morph-destination');
    if (kind === 'path-follow') spec.path = pick('motion-route');
    if (kind === 'count-down') spec.value = 100;
    if (kind === 'reorder') spec.layout = [...spec.target.querySelectorAll('[data-layout-item]')].map((element, i) => ({ element, from: { x: 0, y: i * 36 }, to: { x: 0, y: (2 - i) * 36 } }));
    if (kind === 'card-expand') spec.detail = pick('card-detail');
    return spec;
  });
  function createPlayer(selected, duration, notify) {
    if (native) return createPresentationTimeline({ duration, onStateChange: notify,
      tracks: selected.map(spec => createEffectTrack({ element: spec.target, effect: spec.kind,
        start: spec.start, duration: spec.duration, totalDuration: duration })),
    });
    return createRichPresentation({ root, engine: anime, duration, effects: selected, onStateChange: notify });
  }
  const player = createPresentationGallery({ root, onStateChange,
    createOverall: notify => createPlayer(effects, 14000, notify),
    examples: effects.map(spec => ({ trigger: root.querySelector(`[data-effect-play="${spec.id}"]`),
      create: notify => createPlayer([{ ...spec, start: 0 }], 1700, notify) })),
  });
  return { player, destroy() { player.destroy(); } };
}
