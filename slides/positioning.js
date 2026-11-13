import { createDepthScene } from '../vendor/foundation/depth.js';
import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';

export function createPositioningSlide(root, onStateChange) {
const cards = [...root.querySelectorAll('.depth-layer')];
const stage = root.querySelector('#depth-scene');
const depthScene = createDepthScene({
  root: root.querySelector('#depth-root'), scene: stage, interactive: false,
  layers: cards.map(element => ({ element, depth: Number(element.dataset.depth) })),
});
const frame = (seconds, values) => ({ offset: seconds / 15, ...values });
const tracks = [
  { element: root.querySelector('.slide-header'), keyframes: [
    frame(0, { opacity: 0, translate: '0 24px' }),
    frame(1.4, { opacity: 1, translate: '0 0' }),
    frame(15, { opacity: 1, translate: '0 0' }),
  ] },
  { element: stage, keyframes: [
    frame(0, { transform: 'rotateX(0deg) rotateY(0deg)' }),
    frame(2, { transform: 'rotateX(0deg) rotateY(0deg)' }),
    frame(4, { transform: 'rotateX(2deg) rotateY(-3deg)' }),
    frame(13, { transform: 'rotateX(2deg) rotateY(-3deg)' }),
    frame(15, { transform: 'rotateX(0deg) rotateY(0deg)' }),
  ] },
];
for (const [index, element] of cards.entries()) {
  const z = Number(element.dataset.depth);
  const base = `translate3d(0, 0, ${z}px)`;
  const raised = `translate3d(0, 0, ${z + 95}px)`;
  const enter = 2 + index * 0.25;
  const start = 4 + index * 3;
  const end = start + 3;
  const visible = { opacity: 1, translate: '0 0', transform: base, zIndex: String(10 + index) };
  tracks.push({ element, keyframes: [
    frame(0, { opacity: 0, translate: '0 40px', transform: `translateZ(${z - 70}px)` }),
    frame(enter, { opacity: 0, translate: '0 40px', transform: `translateZ(${z - 70}px)` }),
    frame(enter + 1.1, visible),
    frame(start, visible),
    frame(start + 0.6, { ...visible, transform: raised, zIndex: '100' }),
    frame(end - 0.6, { ...visible, transform: raised, zIndex: '100' }),
    frame(end, visible),
    frame(15, visible),
  ] });
  const shadow = '1px 3px 0 #ddd5c7, 5px 9px 0 #e6dfd4, 12px 22px 28px #493b2622';
  const emphasis = '1px 3px 0 #ddd5c7, 5px 9px 0 #e6dfd4, 12px 34px 40px #493b2648';
  tracks.push({ element: element.querySelector('.card'), keyframes: [
    frame(0, { boxShadow: shadow }), frame(start, { boxShadow: shadow }),
    frame(start + 0.6, { boxShadow: emphasis }), frame(end - 0.6, { boxShadow: emphasis }),
    frame(end, { boxShadow: shadow }), frame(15, { boxShadow: shadow }),
  ] });
}
const player = createPresentationTimeline({
  duration: 15000, tracks,
  onStateChange,
});

return { player, destroy() { player.destroy(); depthScene.destroy(); } };
}
