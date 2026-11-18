import { validatePresentationProject } from './presentation-document.js';
import { createPresentationTimeline, extendPresentationTimeline } from './presentation-timeline.js';
import { extractPresentationContent, estimatePresentationMinimum, describePresentationStructure } from './presentation-context.js';
import { createEvidenceFigure } from './presentation-evidence.js';
import { createPresentationMedia, presentationMediaViews, layoutPresentationMedia } from './presentation-media.js';
export function renderPresentationDocument(input, mount, theme = {}, options = {}) {
    const project = validatePresentationProject(input), doc = mount.ownerDocument, view = doc.defaultView;
    const assets = new Map(project.assets.map(asset => [asset.id, asset]));
    const evidence = new Map(project.evidence?.map(e => [e.id, e]));
    const media = new Map(project.media?.map(m => [m.id, m]));
    const measuring = doc.createElement('canvas').getContext('2d');
    function fitTemplateText(element, box) {
        if (!element || !box || !measuring)
            return;
        const style = view.getComputedStyle(element), words = (element.textContent ?? '').split(/\s+/u);
        for (let size = box.fontSize; size >= box.minFontSize; size--) {
            measuring.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
            let lines = 1, line = '';
            for (const word of words) {
                if (measuring.measureText(word).width > box.width) {
                    for (const char of Array.from(word)) {
                        if (measuring.measureText(line + char).width > box.width) {
                            lines++;
                            line = char;
                        }
                        else
                            line += char;
                    }
                    element.style.overflowWrap = 'anywhere';
                }
                else if (line && measuring.measureText(`${line} ${word}`).width > box.width) {
                    lines++;
                    line = word;
                }
                else
                    line = line ? `${line} ${word}` : word;
            }
            if (lines * size * box.lineHeight <= box.height || size === box.minFontSize) {
                element.style.fontSize = `${size}px`;
                break;
            }
        }
    }
    const sections = options.sections ?? project.document.slides.filter(slide => slide.layout === 'section').map(slide => slide.title);
    function el(tag, className = '', text = '') {
        const result = doc.createElement(tag);
        result.className = className;
        result.textContent = text;
        return result;
    }
    const result = [];
    mount.replaceChildren();
    const visible = options.slideId ? project.document.slides.filter(s => s.id === options.slideId) : project.document.slides;
    if (!visible.length)
        throw Error('미리 볼 장표를 찾을 수 없습니다.');
    visible.forEach((slide, index) => {
        const factory = slide.authored ? options.pages?.get(slide.id) : undefined;
        if (slide.authored && !factory)
            throw Error(`‘${slide.title}’ 페이지 코드가 없습니다. 제작용 프로젝트 폴더에서 실행해 주세요. JSON만으로 페이지 코드를 전달할 수는 없습니다.`);
        const root = el('section', `slide rf-document-slide rf-document-slide--${slide.layout}`);
        if (options.textMotion === false)
            root.dataset.textMotion = 'off';
        if (theme.id)
            root.dataset.template = theme.id;
        if (theme.bodyArt)
            root.style.setProperty('--rf-document-template-band', `url("${new URL(theme.bodyArt, doc.baseURI).href}")`);
        if (theme.badge) {
            const badge = el('span', 'rf-document-badge');
            badge.setAttribute('aria-hidden', 'true');
            badge.style.setProperty('--rf-document-template-badge', `url("${new URL(theme.badge, doc.baseURI).href}")`);
            root.append(badge);
        }
        if (slide.items.length > 4 || slide.items.join('').length > 260)
            root.classList.add('rf-document-slide--dense');
        if (slide.title.length > 50)
            root.classList.add('rf-document-slide--long-title');
        root.id = slide.id;
        root.dataset.notes = slide.notes;
        root.setAttribute('aria-label', slide.title);
        if (theme.logo) {
            const logo = el('img', 'rf-document-logo');
            logo.src = theme.logo;
            logo.alt = theme.logoAlt ?? '';
            root.append(logo);
        }
        const section = el('p', 'rf-document-eyebrow', slide.section && slide.section !== slide.title ? slide.section : project.document.title);
        root.append(section);
        const head = el('header', 'rf-document-heading');
        head.append(el('h1', '', slide.layout === 'section' && theme.agendaTitle ? theme.agendaTitle : slide.title));
        if (slide.message || slide.subtitle)
            head.append(el('p', 'rf-document-subtitle', slide.message || slide.subtitle));
        root.append(head);
        const body = el('div', 'rf-document-body'), copy = el('div', 'rf-document-copy');
        const image = !factory && slide.imageId ? assets.get(slide.imageId) : undefined;
        if (image && !slide.items.length)
            root.classList.add('rf-document-slide--photo-only');
        if (slide.layout === 'content' && !image && slide.items.length >= 2 && slide.items.length <= 3 && slide.items.every(item => /^([^:：]{1,24})[:：]\s*.+$/u.test(item)))
            root.classList.add('rf-document-slide--cards');
        if (image) {
            const figure = el('figure', 'rf-document-photo'), img = el('img');
            img.src = image.dataUrl;
            img.alt = slide.imageAlt || image.name;
            figure.append(img);
            body.append(figure);
        }
        if (slide.layout === 'cover' || slide.layout === 'closing') {
            if (project.document.presenter)
                copy.append(el('p', 'rf-document-presenter', project.document.presenter));
            const art = slide.layout === 'cover' ? theme.coverArt : theme.closingArt;
            if (art) {
                const artwork = el('img', 'rf-document-art');
                artwork.src = art;
                artwork.alt = '';
                root.append(artwork);
            }
        }
        const stepCount = !factory && slide.layout === 'steps' ? slide.items.length : 0;
        const list = el(stepCount ? 'ol' : 'ul', 'rf-document-items');
        const itemElements = (factory ? [] : slide.items).map((text, i) => {
            const item = el('li', 'rf-document-item');
            const label = ['content', 'comparison'].includes(slide.layout) ? /^([^:：]{1,24})[:：]\s*(.+)$/u.exec(text) : null;
            if (label)
                item.append(el('strong', 'rf-document-item-title', label[1]), el('span', 'rf-document-item-text', label[2]));
            else
                item.append(el('span', 'rf-document-item-text', text));
            if (stepCount) {
                item.dataset.s = String(i + 1);
                const number = el('span', 'rf-document-step-number', String(i + 1));
                item.prepend(number);
            }
            list.append(item);
            return item;
        });
        copy.append(list);
        body.append(copy);
        root.append(body);
        if (slide.layout === 'section' && theme.agendaTitle) {
            root.classList.add('rf-document-slide--agenda');
            if (theme.agendaArt) {
                const art = el('img', 'rf-document-agenda-art');
                art.src = theme.agendaArt;
                art.alt = '';
                root.append(art);
            }
            const agenda = el('ol', 'rf-document-agenda');
            if (slide.agendaMode === 'navigation')
                root.classList.add('rf-document-slide--navigation');
            const topics = slide.agendaMode === 'navigation' ? project.document.slides.filter(s => s.role !== 'detail' && s.role !== 'appendix' && s.id !== slide.id && !['cover', 'closing'].includes(s.layout)).map(s => s.title) : sections.length ? sections : [slide.title];
            topics.forEach((topic, i) => { const row = el('li', '', slide.agendaMode === 'navigation' ? '' : topic); if (slide.agendaMode === 'navigation') {
                const button = el('button', '', topic), target = project.document.slides.find(s => s.title === topic && s.id !== slide.id);
                button.type = 'button';
                button.onclick = () => target && options.navigate?.(target.id);
                row.append(button);
            } row.prepend(el('span', 'rf-document-agenda-number', String(i + 1))); if (topic === slide.title) {
                row.classList.add('is-current');
                row.setAttribute('aria-current', 'step');
            } agenda.append(row); });
            body.append(agenda);
        }
        if (!factory && !slide.mediaIds?.length && !['cover', 'closing', 'section'].includes(slide.layout) && !slide.items.length && !image) {
            const empty = el('p', 'rf-document-empty', '이 장표에 본문이 없습니다. 장표 편집에서 내용을 입력해 주세요.');
            body.append(empty);
            root.classList.add('rf-document-slide--empty');
        }
        const diagramItems = [];
        if (stepCount) {
            root.dataset.steps = String(stepCount);
            const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('rf-document-diagram');
            svg.setAttribute('viewBox', '0 0 620 520');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', `${slide.title} 단계 도식`);
            for (let i = 0; i < stepCount; i++) {
                const y = 12 + i * (490 / stepCount), height = Math.min(90, 440 / stepCount);
                if (i < stepCount - 1) {
                    const line = doc.createElementNS(svg.namespaceURI, 'path');
                    line.setAttribute('d', `M 310 ${y + height} v ${490 / stepCount - height - 5} m -7 -8 l 7 8 l 7 -8`);
                    line.setAttribute('class', 'rf-document-connector');
                    svg.append(line);
                }
                const g = doc.createElementNS(svg.namespaceURI, 'g');
                g.classList.add('rf-document-node');
                const rect = doc.createElementNS(svg.namespaceURI, 'rect');
                rect.setAttribute('x', '20');
                rect.setAttribute('y', String(y));
                rect.setAttribute('width', '580');
                rect.setAttribute('height', String(height));
                rect.setAttribute('rx', '10');
                const label = doc.createElementNS(svg.namespaceURI, 'text');
                const lines = [];
                let line = '';
                for (const word of `${i + 1}. ${slide.items[i]}`.split(/\s+/u)) {
                    if (line && Array.from(`${line} ${word}`).length > 28) {
                        lines.push(line);
                        line = word;
                    }
                    else
                        line = line ? `${line} ${word}` : word;
                }
                if (line)
                    lines.push(line);
                const visible = lines.slice(0, 3), font = visible.length > 2 ? 18 : 20, lineHeight = font * 1.2;
                label.setAttribute('x', '44');
                label.setAttribute('y', String(y + height / 2 - (visible.length - 1) * lineHeight / 2 + font * .35));
                label.setAttribute('style', `font-size:${font}px`);
                visible.forEach((line, part) => { const span = doc.createElementNS(svg.namespaceURI, 'tspan'); span.setAttribute('x', '44'); if (part)
                    span.setAttribute('dy', String(lineHeight)); span.textContent = line + (part === 2 && lines.length > 3 ? '…' : ''); label.append(span); });
                g.append(rect, label);
                svg.append(g);
                diagramItems.push(g);
            }
            body.prepend(svg);
        }
        const footer = el('footer', 'rf-document-footer');
        footer.append(el('span', '', slide.section || project.document.title));
        const progress = el('span', 'rf-document-step-state');
        footer.append(progress, el('span', '', `${index + 1 + (options.pageOffset ?? 0)} / ${options.totalSlides ?? project.document.slides.length}`));
        root.append(footer);
        mount.append(root);
        if (slide.layout === 'cover') {
            fitTemplateText(head.querySelector('h1'), theme.coverTitleBox);
            fitTemplateText(head.querySelector('.rf-document-subtitle'), theme.coverSubtitleBox);
        }
        if (factory) {
            root.classList.add('rf-document-slide--authored');
            body.replaceChildren();
        }
        const custom = factory?.({ root, body, slide, data: slide.data ?? {}, assets, evidence, media, document: doc }), timing = custom?.player.describe();
        if (!factory && !slide.items.length && !image && slide.mediaIds?.length)
            body.replaceChildren();
        const autoMedia = [];
        for (const id of slide.mediaIds ?? []) {
            if (!root.querySelector(`[data-media-id="${id}"]`)) {
                const entry = media.get(id);
                if (entry) {
                    const figure = createPresentationMedia(doc, entry).root;
                    body.append(figure);
                    autoMedia.push(figure);
                }
            }
        }
        layoutPresentationMedia(body, autoMedia, slide.mediaLayout);
        if (autoMedia.length)
            root.classList.add('rf-document-slide--media');
        const mediaViews = presentationMediaViews(root);
        let playbackRate = 1;
        if (slide.evidenceIds?.length && !root.querySelector('[data-evidence-id]')) {
            const strip = el('div', 'rf-document-evidence-strip');
            root.classList.add('rf-document-slide--with-evidence');
            for (const id of slide.evidenceIds.slice(0, 2)) {
                const entry = evidence.get(id);
                if (entry)
                    strip.append(createEvidenceFigure(doc, entry));
            }
            root.append(strip);
        }
        const nativeDuration = Math.max(timing?.duration ?? (stepCount ? 2 + stepCount * 3.5 : Math.max(1.5, 1 + itemElements.length * .45)), ...mediaViews.map(m => m.entry.at + m.entry.end - m.entry.start));
        const pageSteps = custom?.stepTimes ?? [], displaySteps = custom ? pageSteps.length : stepCount;
        if (pageSteps.length > 80 || pageSteps.some((at, i) => !Number.isFinite(at) || at < 0 || at > nativeDuration || (i > 0 && at <= pageSteps[i - 1])))
            throw Error('페이지의 단계 시간을 확인해 주세요.');
        if (displaySteps)
            root.dataset.steps = String(displaySteps);
        const duration = nativeDuration * 1000, events = [{ at: 0, text: slide.title }, ...(timing?.events ?? [])];
        // Keep source content readable even when loaded in a hidden tab, paused,
        // or displayed before the playback clock is started.
        const tracks = [{ element: head, keyframes: [{ offset: 0, translate: '0 8px', opacity: 1 }, { offset: 500 / duration, translate: '0 0', opacity: 1 }, { offset: 1, translate: '0 0', opacity: 1 }] }];
        itemElements.forEach((element, i) => {
            const start = stepCount ? 1 + i * 3.5 : .4 + i * .45;
            if (stepCount) {
                const end = Math.min(duration / 1000, start + 3.5);
                tracks.push({ element, keyframes: [{ offset: 0, opacity: .6 }, { offset: start * 1000 / duration, opacity: .6 }, { offset: (start + .3) * 1000 / duration, opacity: 1 }, { offset: end * 1000 / duration, opacity: 1 }, { offset: Math.min(1, (end + .2) * 1000 / duration), opacity: .75 }, { offset: 1, opacity: .75 }] });
            }
            else
                tracks.push({ element, keyframes: [{ offset: 0, opacity: 1, translate: '0 6px' }, { offset: (start + .4) * 1000 / duration, opacity: 1, translate: '0 0' }, { offset: 1, opacity: 1, translate: '0 0' }] });
            events.push({ at: start, text: slide.items[i] });
        });
        let frame = 0, step = 0;
        function updateStep(time) {
            const previousStep = step;
            step = custom ? displaySteps ? Math.max(1, pageSteps.filter(at => at <= time / 1000).length) : 0 : stepCount ? Math.min(stepCount, Math.max(1, Math.floor((time / 1000 - 1) / 3.5) + 1)) : 0;
            itemElements.forEach((element, i) => { element.classList.toggle('is-current', i === step - 1); if (stepCount)
                element.setAttribute('aria-current', i === step - 1 ? 'step' : 'false'); });
            diagramItems.forEach((element, i) => element.classList.toggle('is-current', i === step - 1));
            progress.textContent = displaySteps ? `단계 ${step} / ${displaySteps}` : '';
            if (step !== previousStep)
                root.dispatchEvent(new view.CustomEvent('presentationstepchange', { bubbles: true }));
            mediaViews.forEach(m => m.sync(time, player.state === 'running', playbackRate));
        }
        function tick() { updateStep(player.currentTime); if (player.state === 'running')
            frame = view.requestAnimationFrame(tick); }
        const clock = doc.createElement('span');
        clock.setAttribute('aria-hidden', 'true');
        clock.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
        if (custom)
            root.append(clock);
        const player = custom ? extendPresentationTimeline(custom.player, clock, nativeDuration) : createPresentationTimeline({ duration, tracks, onStateChange: state => {
                view.cancelAnimationFrame(frame);
                if (state === 'running')
                    frame = view.requestAnimationFrame(tick);
                else
                    updateStep(state === 'finished' ? duration : player.currentTime);
            } });
        function followCustom() { view.cancelAnimationFrame(frame); updateStep(player.currentTime); if (player.state === 'running')
            frame = view.requestAnimationFrame(followCustom); }
        const port = { get state() { return player.state; }, get currentTime() { return player.currentTime; }, describe: () => ({ duration: nativeDuration, events }), setPlaybackRate: rate => { playbackRate = rate; player.setPlaybackRate(rate); }, seek: time => { player.seek(time); updateStep(player.currentTime); }, play: () => { player.play(); if (custom)
                followCustom(); }, pause: () => { player.pause(); mediaViews.forEach(m => m.pause()); updateStep(player.currentTime); }, restart: () => { player.restart(); if (custom)
                followCustom(); }, finish: () => { player.finish(); updateStep(player.currentTime); mediaViews.forEach(m => { m.pause(); m.sync(0, false, playbackRate); }); }, destroy: () => player.destroy() };
        updateStep(0);
        const slideView = { root, player: port, stepCount: displaySteps, get step() { return step; },
            goToStep(value) { player.pause(); const position = Math.max(0, Math.min(displaySteps - 1, value - 1)); player.seek((custom ? pageSteps[position] ?? 0 : 1.45 + position * 3.5) * 1000); updateStep(player.currentTime); },
            metadata() { const content = extractPresentationContent(root), minimumDuration = estimatePresentationMinimum({ content, events, animationDuration: nativeDuration, ...describePresentationStructure(root), stepCount: displaySteps }); return { id: slide.id, title: slide.title, notes: slide.notes, content, events, animationDuration: nativeDuration, minimumDuration, duration: Math.max(slide.duration ?? 0, minimumDuration), remoteMedia: mediaViews.some(m => m.entry.kind === 'youtube') }; },
            destroy() { view.cancelAnimationFrame(frame); mediaViews.forEach(m => m.destroy()); player.destroy(); root.remove(); },
        };
        result.push(slideView);
    });
    return { slides: result, destroy() { result.forEach(slide => slide.destroy()); } };
}
