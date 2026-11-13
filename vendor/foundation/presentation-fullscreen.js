/** Call from a user gesture; no document work occurs on module import. */
export function createFullscreenControl(options) {
    const { target, button, onChange, onError } = options;
    const doc = target.ownerDocument;
    let destroyed = false;
    const originalText = button.textContent;
    const originalPressed = button.getAttribute('aria-pressed');
    function changed() {
        if (destroyed)
            return;
        const active = doc.fullscreenElement === target;
        button.textContent = active ? '전체 화면 종료' : '전체 화면';
        button.setAttribute('aria-pressed', String(active));
        onChange?.(active);
    }
    async function toggle() {
        if (destroyed)
            return;
        try {
            if (doc.fullscreenElement === target)
                await doc.exitFullscreen();
            else if (typeof target.requestFullscreen === 'function')
                await target.requestFullscreen({ navigationUI: 'hide' });
            else
                throw new Error('Fullscreen is not supported');
        }
        catch (error) {
            if (!destroyed)
                onError?.(error);
        }
    }
    const click = () => { void toggle(); };
    button.addEventListener('click', click);
    doc.addEventListener('fullscreenchange', changed);
    changed();
    return { toggle, destroy() {
            if (destroyed)
                return;
            destroyed = true;
            button.removeEventListener('click', click);
            doc.removeEventListener('fullscreenchange', changed);
            button.textContent = originalText;
            if (originalPressed === null)
                button.removeAttribute('aria-pressed');
            else
                button.setAttribute('aria-pressed', originalPressed);
        } };
}
