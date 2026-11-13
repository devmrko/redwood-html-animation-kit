import type { PresentationTrack } from './presentation-timeline.js';
export interface PresentationChartOptions {
  root: HTMLElement;
  type: 'bar' | 'line' | 'donut';
  title: string;
  data: readonly { label: string; value: number }[];
}
export function createPresentationChart(options: PresentationChartOptions): { tracks: PresentationTrack[]; destroy(): void } {
  const { root, type, title, data } = options;
  if (!['bar', 'line', 'donut'].includes(type) || !data.length || data.length > 12 ||
      (type === 'donut' && data.length > 5) ||
      data.some(item => !item.label || !Number.isFinite(item.value) || item.value < 0)) throw new RangeError('Invalid chart data');
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!Number.isFinite(total) || (type === 'donut' && total === 0)) throw new RangeError('Invalid chart total');
  const doc = root.ownerDocument;
  const ns = 'http://www.w3.org/2000/svg';
  function node(tag: string, attributes: Record<string, string | number> = {}, text?: string): SVGElement {
    const element = doc.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    if (text !== undefined) element.textContent = text;
    return element;
  }
  const svg = node('svg', { viewBox: '0 0 440 340', role: 'img', 'aria-label': `${title}: ${data.map(item => `${item.label} ${item.value}`).join(', ')}` });
  svg.append(node('title', {}, title));
  const marks: SVGElement[] = [];
  const palette = ['#2C5967', '#E6AC58', '#94AFAF'];
  const max = Math.max(1, ...data.map(item => item.value));
  if (type === 'donut') {
    let offset = 0;
    data.forEach((item, index) => {
      const share = item.value / total * 100;
      const circle = node('circle', { cx: 145, cy: 150, r: 90, pathLength: 100, fill: 'none', stroke: palette[index % 3]!, 'stroke-width': 42,
        'stroke-dasharray': `${share} ${100 - share}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 145 150)' });
      offset += share; marks.push(circle); svg.append(circle);
      svg.append(node('rect', { x: 280, y: 110 + index * 38, width: 12, height: 12, fill: palette[index % 3]! }));
      svg.append(node('text', { x: 302, y: 121 + index * 38, class: 'rf-chart__label' }, `${item.label} ${Math.round(share)}%`));
    });
    svg.append(node('text', { x: 145, y: 157, 'text-anchor': 'middle', class: 'rf-chart__total' }, String(total)));
  } else {
    [0, .5, 1].forEach(fraction => {
      const y = 260 - fraction * 200;
      svg.append(node('line', { x1: 48, y1: y, x2: 420, y2: y, class: 'rf-chart__grid' }));
      svg.append(node('text', { x: 40, y: y + 5, 'text-anchor': 'end', class: 'rf-chart__label' }, String(Math.round(max * fraction))));
    });
    const step = 360 / data.length;
    const points = data.map((item, index) => ({ x: 55 + step * (index + .5), y: 260 - item.value / max * 200 }));
    data.forEach((item, index) => {
      const point = points[index]!;
      svg.append(node('text', { x: point.x, y: 295, 'text-anchor': 'middle', class: 'rf-chart__label' }, item.label));
      if (type === 'bar') {
        const bar = node('rect', { x: point.x - step * .25, y: point.y, width: step * .5, height: 260 - point.y, fill: palette[0]! });
        bar.style.transformBox = 'fill-box'; bar.style.transformOrigin = 'center bottom'; marks.push(bar); svg.append(bar);
        svg.append(node('text', { x: point.x, y: point.y - 12, 'text-anchor': 'middle', class: 'rf-chart__label' }, String(item.value)));
      }
    });
    if (type === 'line') {
      const path = node('path', { d: points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' '), fill: 'none', stroke: palette[0]!, 'stroke-width': 4, pathLength: 1, 'stroke-dasharray': 1 });
      marks.push(path); svg.append(path);
      points.forEach(point => svg.append(node('circle', { cx: point.x, cy: point.y, r: 5, fill: palette[0]! })));
    }
  }
  const original = [...root.childNodes]; root.replaceChildren(svg);
  const tracks: PresentationTrack[] = marks.map((element, index) => ({
    element: element as unknown as HTMLElement,
    keyframes: type === 'line' ? [{ strokeDashoffset: '1', offset: 0 }, { strokeDashoffset: '0', offset: 1 }] :
      type === 'bar' ? [{ transform: 'scaleY(0)', offset: 0 }, { transform: 'scaleY(1)', offset: 1 }] :
        [{ opacity: 0, offset: 0 }, { opacity: 0, offset: index / marks.length * .5 }, { opacity: 1, offset: 1 }],
  }));
  let destroyed = false;
  return { tracks, destroy() { if (!destroyed) { destroyed = true; root.replaceChildren(...original); } } };
}
