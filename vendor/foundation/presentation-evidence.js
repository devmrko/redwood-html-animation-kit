const labels = { capture: '제품·실행 화면', revisit: '사후 재열람', log: '저장 로그 화면', mock: '모의·재현 화면' };
/** Modal Esc must not reach the deck's global keyboard navigation. */
export function guardPresentationDialog(dialog, options = {}) {
    const doc = dialog.ownerDocument;
    const allowed = () => { if (options.canClose && !options.canClose()) {
        options.onBlocked?.();
        return false;
    } return true; };
    const cancel = (event) => { if (!allowed())
        event.preventDefault(); };
    dialog.addEventListener('cancel', cancel);
    const capture = (event) => { if ((event.key === 'Escape' || event.keyCode === 27) && dialog.open && Array.from(doc.querySelectorAll('dialog[open]')).at(-1) === dialog) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (allowed())
            dialog.close();
    } };
    doc.addEventListener('keydown', capture, true);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => { doc.removeEventListener('keydown', capture, true); dialog.removeEventListener('cancel', cancel); }, { once: true });
}
/** The manifest owns provenance; the full raster is loaded when expanded. */
export function createEvidenceFigure(doc, e) {
    const figure = doc.createElement('figure');
    figure.className = 'rf-evidence';
    figure.dataset.evidenceId = e.id;
    const button = doc.createElement('button'), img = doc.createElement('img'), caption = doc.createElement('figcaption');
    button.type = 'button';
    button.setAttribute('aria-label', `${e.title} 원본 확대`);
    img.src = e.path;
    img.loading = 'lazy';
    img.alt = e.claim || e.title;
    button.append(img);
    caption.textContent = [e.title, labels[e.kind], e.claim].filter(Boolean).join(' · ');
    figure.append(button, caption);
    button.onclick = () => {
        const dialog = doc.createElement('dialog');
        dialog.className = 'rf-evidence-dialog';
        dialog.setAttribute('aria-label', e.title);
        guardPresentationDialog(dialog);
        const close = doc.createElement('button');
        close.type = 'button';
        close.textContent = '닫기';
        const heading = doc.createElement('h2');
        heading.textContent = e.title;
        const info = doc.createElement('p');
        info.textContent = [labels[e.kind], e.capturedAt, e.source, e.claim].filter(Boolean).join(' · ');
        const original = doc.createElement('a');
        original.href = e.path;
        original.target = '_blank';
        original.rel = 'noopener';
        original.textContent = '원본 파일 열기';
        const full = doc.createElement('img');
        full.src = e.path;
        full.alt = e.claim || e.title;
        const hash = doc.createElement('p');
        hash.className = 'rf-evidence-hash';
        hash.textContent = `SHA-256 ${e.sha256}`;
        full.onerror = () => { info.textContent += ' · 원본을 불러오지 못했습니다. 파일 경로·용량·해시를 확인해 주세요.'; };
        dialog.append(close, heading, info, original, full, hash);
        doc.body.append(dialog);
        close.onclick = () => dialog.close();
        dialog.addEventListener('close', () => { dialog.remove(); button.focus(); }, { once: true });
        dialog.showModal();
        close.focus();
    };
    return figure;
}
