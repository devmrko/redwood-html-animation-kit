import { createRevealTrack } from './presentation-flow.js';
/** Small reusable presets, all driven by the existing presentation timeline. */
export function createEffectTrack(options) {
    const baseline = createRevealTrack(options);
    if (options.effect === 'rise')
        return baseline;
    const presets = {
        'fade-in': [{ opacity: 0 }, { opacity: 1 }],
        'fade-out': [{ opacity: 1 }, { opacity: 0 }],
        highlight: [
            { boxShadow: '0 0 0 0 rgba(183, 133, 53, 0)' },
            { boxShadow: '0 0 0 6px rgba(183, 133, 53, 0.4)' },
            { boxShadow: '0 0 0 0 rgba(183, 133, 53, 0)' },
        ],
        pulse: [{ scale: '1' }, { scale: '1.12' }, { scale: '1' }],
        expand: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
        zoom: [{ opacity: 0, scale: '0.4' }, { opacity: 1, scale: '1.08' }, { opacity: 1, scale: '1' }],
        bounce: [{ opacity: 0, translate: '0 -30px' }, { opacity: 1, translate: '0 0' },
            { opacity: 1, translate: '0 -12px' }, { opacity: 1, translate: '0 0' }],
        flip: [{ opacity: 0, transform: 'perspective(500px) rotateY(-90deg)' },
            { opacity: 1, transform: 'perspective(500px) rotateY(0deg)' }],
        rotate: [{ opacity: 0, rotate: '-160deg', scale: '0.4' }, { opacity: 1, rotate: '0deg', scale: '1' }],
        'rubber-band': [{ scale: '1' }, { scale: '1.2 0.8' }, { scale: '0.85 1.15' }, { scale: '1.07 0.93' }, { scale: '1' }],
        shake: [{ translate: '0 0' }, { translate: '-12px 0' }, { translate: '12px 0' },
            { translate: '-9px 0' }, { translate: '9px 0' }, { translate: '0 0' }],
    };
    if (!Object.hasOwn(presets, options.effect))
        throw new RangeError('Unsupported presentation effect');
    const samples = presets[options.effect];
    const { start, duration, totalDuration, element } = options;
    return { element, keyframes: [
            { ...samples[0], offset: 0 },
            ...samples.map((frame, index) => ({ ...frame,
                offset: (start + duration * index / (samples.length - 1)) / totalDuration })),
            { ...samples.at(-1), offset: 1 },
        ] };
}
export function createStaggerTracks(options) {
    const { elements, stagger, ...effect } = options;
    if (elements.length === 0 || new Set(elements).size !== elements.length || !Number.isFinite(stagger) || stagger < 0) {
        throw new RangeError('Provide unique elements and a finite non-negative stagger');
    }
    return elements.map((element, index) => createEffectTrack({ ...effect, element,
        start: effect.start + index * stagger }));
}
