import { createPresentationTimeline } from './presentation-timeline.js';
/** Render only the server-validated HTML/SVG and reuse the common presentation clock. */
export function createAiPresentationPage(page) {
    return ({ body, assets, document: doc }) => {
        const canvas = doc.createElement('div');
        canvas.className = 'rf-ai-body';
        canvas.style.cssText = 'position:relative;isolation:isolate;overflow:hidden;width:100%;height:100%;font-family:inherit';
        const template = doc.createElement('template');
        template.innerHTML = page.html;
        // Defense for portable files edited outside the server. No scripts, event handlers or URL loads.
        for (let node of [...template.content.querySelectorAll('*')]) {
            if (!/^(div|section|article|header|footer|p|span|strong|em|b|i|small|h2|h3|h4|ul|ol|li|dl|dt|dd|table|colgroup|col|thead|tbody|tfoot|tr|td|th|caption|figure|figcaption|img|br|svg|title|desc|g|rect|circle|ellipse|line|path|polyline|polygon|text|tspan|defs|marker|lineargradient|radialgradient|stop)$/.test(node.tagName.toLowerCase())) {
                node.remove();
                continue;
            }
            // Reveal treats any descendant section as a vertical slide. Preserve its
            // content and styling without creating a second presentation page.
            if (node.tagName === 'SECTION') {
                const bodySection = doc.createElement('div');
                for (const attribute of [...node.attributes])
                    bodySection.setAttribute(attribute.name, attribute.value);
                bodySection.append(...node.childNodes);
                node.replaceWith(bodySection);
                node = bodySection;
            }
            for (const attr of [...node.attributes])
                if (/^on/i.test(attr.name) || ['src', 'href', 'xlink:href', 'srcdoc'].includes(attr.name) || attr.name === 'style' && /url\s*\(|expression|@|\\|font-family|position\s*:\s*(fixed|sticky)/i.test(attr.value))
                    node.removeAttribute(attr.name);
        }
        canvas.append(template.content);
        body.replaceChildren(canvas);
        for (const image of canvas.querySelectorAll('img')) {
            const asset = assets.get(image.dataset.assetId ?? '');
            if (asset)
                image.src = asset.dataUrl;
            else
                image.remove();
        }
        const duration = page.duration * 1000, tracks = [], steps = [];
        for (const effect of page.effects) {
            if (!/^[.#][a-zA-Z][\w-]{0,79}$/.test(effect.selector))
                continue;
            const from = { opacity: 0, transform: effect.type === 'slide-up' ? 'translateY(28px)' : effect.type === 'slide-left' ? 'translateX(28px)' : effect.type === 'scale' ? 'scale(.92)' : 'none' }, to = { opacity: 1, transform: 'none' };
            for (const element of canvas.querySelectorAll(effect.selector))
                tracks.push({ element, keyframes: [{ offset: 0, ...from }, { offset: effect.at / page.duration, ...from }, { offset: (effect.at + effect.duration) / page.duration, ...to }, { offset: 1, ...to }] });
            steps.push(effect.at + effect.duration);
        }
        if (!tracks.length)
            tracks.push({ element: canvas, keyframes: [{ opacity: 1 }, { opacity: 1 }] });
        return { player: createPresentationTimeline({ duration, tracks }), stepTimes: [...new Set(steps)].sort((a, b) => a - b) };
    };
}
