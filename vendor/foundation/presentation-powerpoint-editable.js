import { presentationFontFamilies, presentationFontRuns } from './presentation-typography.js';
import { capturePresentationPowerPointSlide, preparePresentationPowerPointSlide } from './presentation-powerpoint.js';
function rgb(value) { const match = /^rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:[, /]+([.\d]+))?\)$/.exec(value); if (!match || match[4] === '0')
    return undefined; return match.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase(); }
/** Convert ordinary DOM text, tables, images and basic SVG shapes to native PPT objects.
 * Unhandled CSS artwork, SVG paths and canvas content stay in the background image.
 */
export async function captureEditablePresentationSlide(root, toPng) {
    const doc = root.ownerDocument, view = doc.defaultView;
    await preparePresentationPowerPointSlide(root);
    const measure = doc.createElement('canvas').getContext('2d'), fontCache = new Map();
    const available = (family) => { if (fontCache.has(family))
        return fontCache.get(family); const sample = 'mmmmmmWWWWWabcdef123456789'; const width = (face) => { measure.font = `72px ${face}`; return measure.measureText(sample).width; }; const a = width(`"${family}",monospace`), b = width(`"${family}",serif`), result = Math.abs(a - b) < .01 && (Math.abs(a - width('monospace')) > .01 || Math.abs(b - width('serif')) > .01); fontCache.set(family, result); return result; };
    const families = (el) => presentationFontFamilies(view.getComputedStyle(el).fontFamily, view.navigator.platform, available);
    const base = root.getBoundingClientRect(), unit = 13.333333 / base.width, objects = [], omit = new Set();
    const box = (rect) => ({ x: (rect.x - base.x) * unit, y: (rect.y - base.y) * unit, w: rect.width * unit, h: rect.height * unit });
    const visible = (el) => { const s = view.getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0 && r.bottom > base.top && r.top < base.bottom; };
    const font = (el, text = '') => { const s = view.getComputedStyle(el); return { fontFace: families(el).latin, fontSize: parseFloat(s.fontSize) * .6, bold: Number(s.fontWeight) >= 600, italic: s.fontStyle === 'italic', color: rgb(s.color) ?? '2A2F2F', margin: 0, breakLine: false, transparency: (1 - Number(s.opacity)) * 100 }; };
    const background = (el) => { for (let current = el; current; current = current.parentElement) {
        const value = rgb(view.getComputedStyle(current).backgroundColor);
        if (value)
            return value;
        if (current === root)
            break;
    } return undefined; };
    const cellRuns = (cell) => { const runs = [], walker = doc.createTreeWalker(cell, view.NodeFilter.SHOW_TEXT); let n; while (n = walker.nextNode()) {
        const text = n.textContent ?? '', parent = n.parentElement;
        if (!text || !parent)
            continue;
        const style = view.getComputedStyle(parent);
        if (parent !== cell && style.display === 'block' && runs.length)
            runs.push({ text: '\n', options: {} });
        const f = font(parent, text);
        for (const run of presentationFontRuns(text, families(parent)))
            runs.push({ text: run.text, options: { ...run.options, fontSize: f.fontSize, bold: f.bold, italic: f.italic, color: f.color } });
    } return runs; };
    // A native table retains rows and cells instead of a collection of text boxes.
    for (const table of root.querySelectorAll('table')) {
        if (!visible(table) || table.closest('[data-ppt-raster]'))
            continue;
        const rows = Array.from(table.rows);
        if (!rows.length || rows.some(r => Array.from(r.cells).some(c => c.colSpan !== 1 || c.rowSpan !== 1)))
            continue;
        const widths = Array.from(rows[0].cells).map(c => c.getBoundingClientRect().width * unit);
        if (rows.some(r => r.cells.length !== widths.length))
            continue;
        const data = rows.map(row => Array.from(row.cells).map(cell => { const s = view.getComputedStyle(cell), fill = background(cell); return { text: cellRuns(cell), options: { ...font(cell, cell.innerText), bold: cell.tagName === 'TH' || Number(s.fontWeight) >= 600, fill: fill ? { color: fill } : undefined, margin: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map(k => parseFloat(s[k]) * .6), border: ['Top', 'Right', 'Bottom', 'Left'].map(side => { const width = parseFloat(s.getPropertyValue('border-' + side.toLowerCase() + '-width')); return { type: width ? 'solid' : 'none', pt: width * .6, color: rgb(s.getPropertyValue('border-' + side.toLowerCase() + '-color')) ?? 'C4C7C5' }; }) } }; }));
        objects.push({ kind: 'table', rows: data, options: { ...box(table.getBoundingClientRect()), colW: widths, rowH: rows.map(r => r.getBoundingClientRect().height * unit), autoPage: false, margin: 0, verbose: false } });
        omit.add(table);
    }
    // Simple rectangles, ellipses and straight lines remain native editable shapes.
    const nativeSvg = new Set();
    for (const svg of root.querySelectorAll('svg')) {
        if (!visible(svg) || svg.querySelector('path,polygon,polyline,use,image,foreignObject,clipPath,mask,linearGradient,radialGradient') || svg.closest('[data-ppt-raster]'))
            continue;
        if (Array.from(svg.querySelectorAll('rect,circle,ellipse,line')).some(el => { const m = el.getScreenCTM(); return !m || Math.abs(m.b) > .001 || Math.abs(m.c) > .001; }))
            continue;
        nativeSvg.add(svg);
        for (const el of svg.querySelectorAll('rect,circle,ellipse,line')) {
            if (el.tagName !== 'line' && !visible(el))
                continue;
            const s = view.getComputedStyle(el), matrix = el.getScreenCTM();
            if (!matrix || Math.abs(matrix.b) > .001 || Math.abs(matrix.c) > .001)
                continue;
            const fill = rgb(s.fill), stroke = rgb(s.stroke), options = { ...box(el.getBoundingClientRect()), fill: { color: fill ?? 'FFFFFF', transparency: fill ? 0 : 100 }, line: { color: stroke ?? 'FFFFFF', transparency: stroke ? 0 : 100, width: parseFloat(s.strokeWidth) * Math.abs(matrix.a) * unit * 72 }, radius: 0 };
            objects.push({ kind: 'shape', shape: el.tagName === 'rect' ? 'rect' : el.tagName === 'line' ? 'line' : 'ellipse', options });
            omit.add(el);
        }
    }
    // Local images become separate objects. CSS-cropped images remain in the background.
    for (const image of root.querySelectorAll('img')) {
        if (!visible(image) || image.closest('table,[data-ppt-raster]') || view.getComputedStyle(image).objectFit === 'cover')
            continue;
        try {
            await image.decode();
            const r = image.getBoundingClientRect(), s = view.getComputedStyle(image);
            let w = r.width, h = r.height, x = r.x, y = r.y;
            if (s.objectFit === 'contain') {
                const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
                const nw = image.naturalWidth * scale, nh = image.naturalHeight * scale;
                x += (w - nw) / 2;
                y += (h - nh) / 2;
                w = nw;
                h = nh;
            }
            const canvas = doc.createElement('canvas');
            canvas.width = Math.max(1, Math.min(3200, image.naturalWidth));
            canvas.height = Math.max(1, Math.round(canvas.width * image.naturalHeight / image.naturalWidth));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            objects.push({ kind: 'image', options: { data: canvas.toDataURL('image/png'), x: (x - base.x) * unit, y: (y - base.y) * unit, w: w * unit, h: h * unit, altText: image.alt } });
            omit.add(image);
        }
        catch { /* Keep a source image in the captured background if it cannot be isolated. */ }
    }
    // Measure visible text by rendered line, retaining wrapping and mixed formatting.
    const walker = doc.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
    let node, characters = 0;
    while (node = walker.nextNode()) {
        const text = node.textContent ?? '', parent = node.parentElement;
        if (!text.trim() || !parent || !visible(parent) || parent.closest('script,style,canvas,video,iframe,[data-ppt-raster]'))
            continue;
        if (Array.from(omit).some(el => el.contains(node)))
            continue;
        const svg = parent.closest('svg');
        if (svg && !nativeSvg.has(svg))
            continue;
        characters += text.length;
        if (characters > 30000)
            throw Error('편집형 PPT의 장표 텍스트가 너무 많습니다. 장표를 나누거나 화면 유지 방식을 사용해 주세요.');
        const range = doc.createRange(), lines = [];
        for (let i = 0; i < text.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const r = range.getBoundingClientRect();
            if (!r.width || !r.height)
                continue;
            const last = lines.at(-1);
            if (last && Math.abs(last.rect.y - r.y) < 1) {
                last.text += text[i];
                last.rect = new view.DOMRect(Math.min(last.rect.x, r.x), last.rect.y, Math.max(last.rect.right, r.right) - Math.min(last.rect.x, r.x), Math.max(last.rect.height, r.height));
            }
            else
                lines.push({ text: text[i], rect: r });
        }
        for (const line of lines) {
            if (!line.text.trim())
                continue;
            const bounds = box(line.rect), style = font(parent, line.text);
            objects.push({ kind: 'text', text: presentationFontRuns(line.text, families(parent)), options: { ...bounds, w: bounds.w + .035, h: Math.max(bounds.h, style.fontSize / 72 * 1.25), ...style, valign: 'top', paraSpaceAfterPt: 0, wrap: false } });
        }
        omit.add(node);
    }
    for (const svg of nativeSvg)
        omit.add(svg);
    const hidden = [];
    try {
        for (const node of omit)
            if (node instanceof view.HTMLElement || node instanceof view.SVGElement) {
                hidden.push({ el: node, value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') });
                node.style.setProperty('visibility', 'hidden', 'important');
            }
        const image = await capturePresentationPowerPointSlide(root, toPng, node => node.nodeType !== view.Node.TEXT_NODE || !omit.has(node));
        return { image, objects };
    }
    finally {
        for (const { el, value, priority } of hidden) {
            if (value)
                el.style.setProperty('visibility', value, priority);
            else
                el.style.removeProperty('visibility');
        }
    }
}
