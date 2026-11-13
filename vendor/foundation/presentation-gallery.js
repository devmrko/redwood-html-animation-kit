/** One owned player at a time for both automatic and button-triggered samples. */
export function createPresentationGallery(options) {
    const { root, examples, createOverall, onStateChange } = options;
    if (!examples.length || new Set(examples.map(example => example.trigger)).size !== examples.length ||
        examples.some(example => !root.contains(example.trigger)))
        throw new TypeError('Provide unique contained triggers');
    let destroyed = false;
    const notify = (state) => { if (state !== 'destroyed')
        onStateChange?.(state); };
    let current = createOverall(notify);
    function replace(create, finish = false) {
        if (destroyed)
            return;
        current.destroy();
        current = create(notify);
        if (finish)
            current.finish();
        else
            current.play();
    }
    const listeners = examples.map(example => {
        const listener = () => replace(example.create);
        example.trigger.addEventListener('click', listener);
        return { trigger: example.trigger, listener };
    });
    return {
        get state() { return destroyed ? 'destroyed' : current.state; },
        get currentTime() { return current.currentTime; },
        play() { if (!destroyed)
            current.play(); },
        pause() { if (!destroyed)
            current.pause(); },
        restart() { replace(createOverall); },
        finish() { replace(createOverall, true); },
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            current.destroy();
            listeners.forEach(({ trigger, listener }) => trigger.removeEventListener('click', listener));
            onStateChange?.('destroyed');
        },
    };
}
