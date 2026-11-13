export function createPresentationTimeline(options) {
    const { duration, tracks, onStateChange } = options;
    if (!Number.isFinite(duration) || duration <= 0 || tracks.length === 0) {
        throw new RangeError('A finite positive duration and animation tracks are required');
    }
    const doc = tracks[0]?.element.ownerDocument;
    const view = doc?.defaultView;
    if (!doc || !view || tracks.some(track => track.element.ownerDocument !== doc ||
        typeof track.element.animate !== 'function' || track.keyframes.length === 0)) {
        throw new TypeError('Animation tracks must use supported elements from one browser document');
    }
    const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = [];
    try {
        for (const track of tracks) {
            const animation = track.element.animate(track.keyframes, {
                duration, fill: 'both', easing: 'linear',
            });
            animations.push(animation);
            animation.pause();
            animation.currentTime = 0;
        }
    }
    catch (error) {
        for (const animation of animations)
            animation.cancel();
        throw error;
    }
    let state = 'idle';
    let time = 0;
    function emit(next) {
        if (state === next)
            return;
        state = next;
        onStateChange?.(next);
    }
    function currentTime() {
        const value = animations[0]?.currentTime;
        return typeof value === 'number' ? Math.max(0, Math.min(duration, value)) : time;
    }
    function finish() {
        if (state === 'destroyed')
            return;
        for (const animation of animations)
            animation.finish();
        time = duration;
        emit('finished');
    }
    function pause() {
        if (state !== 'running')
            return;
        time = currentTime();
        for (const animation of animations) {
            animation.pause();
            animation.currentTime = time;
        }
        emit('paused');
    }
    function play() {
        if (state === 'destroyed' || state === 'running')
            return;
        if (reduced.matches) {
            finish();
            return;
        }
        if (doc?.hidden)
            return;
        if (state === 'finished')
            time = 0;
        const now = doc?.timeline.currentTime;
        for (const animation of animations) {
            animation.currentTime = time;
            animation.play();
            if (typeof now === 'number')
                animation.startTime = now - time;
        }
        emit('running');
    }
    function onFinish() {
        if (state === 'running' && animations.every(animation => animation.playState === 'finished')) {
            time = duration;
            emit('finished');
        }
    }
    function onVisibility() { if (doc?.hidden)
        pause(); }
    function onReduced() { if (reduced.matches)
        finish(); }
    for (const animation of animations)
        animation.onfinish = onFinish;
    doc.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onReduced);
    return {
        get state() { return state; },
        get currentTime() { return state === 'destroyed' ? time : currentTime(); },
        play, pause, finish,
        restart() {
            if (state === 'destroyed')
                return;
            for (const animation of animations) {
                animation.pause();
                animation.currentTime = 0;
            }
            time = 0;
            emit('idle');
            play();
        },
        destroy() {
            if (state === 'destroyed')
                return;
            time = currentTime();
            for (const animation of animations) {
                animation.onfinish = null;
                animation.cancel();
            }
            doc.removeEventListener('visibilitychange', onVisibility);
            reduced.removeEventListener('change', onReduced);
            emit('destroyed');
        },
    };
}
