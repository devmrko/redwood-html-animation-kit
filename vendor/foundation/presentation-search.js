import { guardPresentationDialog } from './presentation-evidence.js';
export function searchPresentation(project, query, rendered = new Map()) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    if (!words.length)
        return [];
    const result = [];
    for (const slide of project.document.slides) {
        const text = [slide.title, slide.message, slide.subtitle, ...slide.items, slide.notes, slide.data ? JSON.stringify(slide.data) : '', rendered.get(slide.id), ...(slide.evidenceIds ?? []).flatMap(id => { const e = project.evidence?.find(v => v.id === id); return e ? [e.title, e.claim, e.source] : []; })].filter(Boolean).join(' ').replace(/\s+/gu, ' '), lower = text.toLocaleLowerCase();
        if (words.every(word => lower.includes(word))) {
            const at = Math.max(0, lower.indexOf(words[0]) - 35);
            result.push({ id: slide.id, title: slide.title, snippet: (at ? '…' : '') + text.slice(at, at + 180) + (text.length > at + 180 ? '…' : '') });
        }
    }
    return result.sort((a, b) => Number(words.some(w => b.title.toLocaleLowerCase().includes(w))) - Number(words.some(w => a.title.toLocaleLowerCase().includes(w))));
}
export function openPresentationSearch(doc, project, navigate, rendered) {
    const existing = doc.querySelector('.rf-search-dialog input');
    if (existing) {
        existing.focus();
        return;
    }
    const dialog = doc.createElement('dialog');
    dialog.className = 'rf-search-dialog';
    dialog.setAttribute('aria-label', '장표 찾기');
    guardPresentationDialog(dialog);
    const heading = doc.createElement('h2');
    heading.textContent = '장표 찾기';
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = '닫기';
    close.onclick = () => dialog.close();
    const input = doc.createElement('input');
    input.type = 'search';
    input.placeholder = '제목·본문·스크립트 검색';
    input.setAttribute('aria-label', '검색어');
    const status = doc.createElement('p');
    status.setAttribute('role', 'status');
    const list = doc.createElement('div');
    const render = () => { list.replaceChildren(); const rows = searchPresentation(project, input.value, rendered); status.textContent = input.value.trim() ? `${rows.length}개 장표` : '검색어를 입력하세요.'; for (const row of rows) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'rf-search-result';
        const title = doc.createElement('strong');
        title.textContent = row.title;
        const snippet = doc.createElement('span');
        snippet.textContent = row.snippet;
        button.append(title, snippet);
        button.onclick = () => { dialog.close(); navigate(row.id); };
        list.append(button);
    } };
    input.oninput = render;
    input.onkeydown = event => { if (event.key === 'Enter') {
        event.preventDefault();
        list.querySelector('button')?.click();
    } };
    dialog.append(close, heading, input, status, list);
    doc.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    render();
    dialog.showModal();
    input.focus();
}
export function createPresentationShortcuts(doc, actions) {
    const handle = (event) => { if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
        return; const key = event.key.toLowerCase(); if (key === 'f' || key === 's' && actions.save) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (key === 'f')
            actions.find();
        else
            actions.save?.();
    } };
    doc.addEventListener('keydown', handle, true);
    return () => doc.removeEventListener('keydown', handle, true);
}
