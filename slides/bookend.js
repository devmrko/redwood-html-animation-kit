import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';

export function createBookendSlide(root, onStateChange) {
  const player = createPresentationTimeline({
    duration: 800,
    tracks: [{ element: root.querySelector('.bookend-content'), keyframes: [{ opacity: 0 }, { opacity: 1 }] }],
    onStateChange,
  });
  return { player, destroy: () => player.destroy() };
}
