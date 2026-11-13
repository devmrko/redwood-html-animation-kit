function validateTime(start, duration, total, settle = 0) {
    if (![start, duration, total, settle].every(Number.isFinite) || start < 0 || duration <= 0 ||
        total <= 0 || settle < 0 || start + duration + settle > total) {
        throw new RangeError('Animation timing is outside the presentation duration');
    }
}
export function createRevealTrack(options) {
    const { element, start, duration, totalDuration } = options;
    validateTime(start, duration, totalDuration);
    return { element, keyframes: [
            { offset: 0, opacity: 0, translate: '0 12px' },
            { offset: start / totalDuration, opacity: 0, translate: '0 12px' },
            { offset: (start + duration) / totalDuration, opacity: 1, translate: '0 0' },
            { offset: 1, opacity: 1, translate: '0 0' },
        ] };
}
/** Build tracks only: caller supplies positioned HTML and a shared presentation player. */
export function createFlowTracks(options) {
    const { element, path, start, duration, totalDuration, settle = 300, mode = 'dock', finalScale = 1, receipt } = options;
    validateTime(start, duration, totalDuration, settle);
    if ((path.length !== 2 && path.length !== 4) ||
        path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)) ||
        !Number.isFinite(finalScale) || finalScale <= 0 || finalScale > 3 ||
        (mode !== 'dock' && mode !== 'merge')) {
        throw new RangeError('Use a finite 2-point line or 4-point Bezier path and supported scale/mode');
    }
    if (receipt && (receipt === element || receipt.ownerDocument !== element.ownerDocument)) {
        throw new TypeError('Receipt must be a separate element in the same document');
    }
    function pointAt(t) {
        const first = path[0];
        const last = path[path.length - 1];
        if (path.length === 2)
            return { x: first.x + (last.x - first.x) * t, y: first.y + (last.y - first.y) * t };
        const b = path[1];
        const c = path[2];
        const u = 1 - t;
        return {
            x: u ** 3 * first.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * last.x,
            y: u ** 3 * first.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * last.y,
        };
    }
    function transform(point, scale) {
        return `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) scale(${scale})`;
    }
    const keyframes = [{ offset: 0, opacity: 0, transform: transform(path[0], 1) }];
    for (let step = 0; step <= 24; step++) {
        const progress = step / 24;
        const eased = progress * progress * (3 - 2 * progress);
        keyframes.push({
            offset: (start + duration * progress) / totalDuration,
            opacity: Math.min(1, progress * 8), transform: transform(pointAt(eased), 1),
        });
    }
    const arrival = path[path.length - 1];
    const final = { opacity: mode === 'merge' ? 0 : 1, transform: transform(arrival, mode === 'merge' ? 0.15 : finalScale) };
    keyframes.push({ offset: (start + duration + settle) / totalDuration, ...final }, { offset: 1, ...final });
    const tracks = [{ element, keyframes }];
    if (receipt) {
        // Use the same settling interval; zero-duration settling is a discrete reveal.
        if (settle === 0) {
            const offset = (start + duration) / totalDuration;
            tracks.push({ element: receipt, keyframes: [
                    { offset: 0, opacity: 0 }, { offset, opacity: 0 },
                    { offset, opacity: 1 }, { offset: 1, opacity: 1 },
                ] });
        }
        else {
            tracks.push(createRevealTrack({ element: receipt, start: start + duration,
                duration: settle, totalDuration }));
        }
    }
    return tracks;
}
