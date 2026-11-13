import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';
import { createFlowTracks, createRevealTrack } from '../vendor/foundation/presentation-flow.js';

export function createFlowSlide(root, onStateChange) {
  const totalDuration = 18000;
  const pick = id => root.querySelector(`#${id}`);
  const reveal = (element, start, duration = 600) => createRevealTrack({ element, start, duration, totalDuration });
  const tracks = [reveal(root.querySelector('.slide-header'), 0)];
  ['db-source', 'doc-source', 'api-source', 'collector', 'engine'].forEach((id, index) => {
    tracks.push(reveal(pick(id), index * 160));
  });
  const objects = [
    { id: 'flow-relation', source: { x: 245, y: 102 }, target: { x: 557, y: 200 } },
    { id: 'flow-code', source: { x: 245, y: 102 }, target: { x: 783, y: 200 } },
    { id: 'flow-term', source: { x: 245, y: 310 }, target: { x: 557, y: 296 } },
    { id: 'flow-rule', source: { x: 245, y: 310 }, target: { x: 783, y: 296 } },
    { id: 'flow-api', source: { x: 245, y: 518 }, target: { x: 557, y: 392 } },
    { id: 'flow-skill', source: { x: 245, y: 518 }, target: { x: 783, y: 392 } },
  ];
  objects.forEach(({ id, source, target }, index) => {
    tracks.push(...createFlowTracks({
      element: pick(id), path: [source, { x: 350, y: source.y }, { x: target.x > 700 ? 660 : 390, y: target.x > 700 ? target.y - 85 : target.y }, target],
      start: 1800 + index * 1000, duration: 1700, totalDuration, mode: 'dock', finalScale: 0.94,
    }));
  });
  tracks.push(reveal(pick('collection-complete'), 9000));
  tracks.push(...createFlowTracks({
    element: pick('flow-context'),
    path: [{ x: 910, y: 310 }, { x: 990, y: 310 }, { x: 1050, y: 152 }, { x: 1275, y: 152 }],
    start: 9700, duration: 2100, totalDuration, mode: 'merge', receipt: pick('context-ready'),
  }));
  tracks.push(reveal(pick('answer'), 12400));
  tracks.push(...createFlowTracks({
    element: pick('flow-result'), path: [{ x: 1275, y: 274 }, { x: 1275, y: 450 }],
    start: 12400, duration: 1300, totalDuration, mode: 'merge', receipt: pick('answer-ready'),
  }));
  const player = createPresentationTimeline({ duration: totalDuration, tracks, onStateChange });
  return { player, destroy() { player.destroy(); } };
}
