export interface SubtitleCue { start: number; end: number; text: string }
export interface ExportSlide { id: string; title: string; notes: string; duration: number; captions: SubtitleCue[]; included: boolean; autoReading?: boolean; animationDuration?: number; minimumDuration?: number }
export interface PlannedSlide extends ExportSlide { offset: number; playbackRate: number; timeScale: number }

/** An editable reading estimate, not an audio duration prediction. */
export function subtitleReadingSeconds(text: string): number {
  return Math.max(2, Array.from(text.replace(/\s/g, '')).length / 6 + .6);
}

export function planSlideTiming(slide: ExportSlide): { duration: number; captions: SubtitleCue[]; timeScale: number; playbackRate: number } {
  const captions = validateSubtitleCues(slide.captions, slide.duration);
  let timeScale = 1;
  if (slide.autoReading !== false) {
    timeScale = Math.max(1,
      ...captions.map(cue => subtitleReadingSeconds(cue.text) / (cue.end - cue.start)));
    // Round upwards to avoid shortening any caption through rounding.
    timeScale = Math.ceil(timeScale * 1000) / 1000;
  }
  if ([slide.animationDuration, slide.minimumDuration].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error('화면 최소 시간을 확인해 주세요.');
  const base = slide.autoReading !== false ? Math.max(slide.duration, slide.animationDuration ?? 0, slide.minimumDuration ?? 0) : slide.duration;
  return { duration: base * timeScale, timeScale, playbackRate: 1 / timeScale,
    captions: captions.map(cue => ({ ...cue, start: cue.start * timeScale, end: cue.end * timeScale })) };
}

export function validateSubtitleCues(cues: readonly SubtitleCue[], duration: number): SubtitleCue[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('재생 시간을 확인해 주세요.');
  if (!Array.isArray(cues) || cues.length > 500) throw new Error('자막 목록을 확인해 주세요.');
  let previousEnd = 0;
  return cues.map(cue => {
    if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < previousEnd || cue.start < 0 || cue.end <= cue.start || cue.end > duration + .001)
      throw new Error('자막 시간이 겹치거나 재생 시간을 벗어났습니다.');
    if (typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 500 || /\u0000|-->/.test(cue.text)) throw new Error('자막 문구를 확인해 주세요.');
    previousEnd = cue.end;
    return { start: cue.start, end: cue.end, text: cue.text.trim() };
  });
}

export function createSubtitleDraft(notes: string, duration: number): SubtitleCue[] {
  if (!notes.trim()) return [];
  const parts = notes.trim().replace(/^\s*\d+[.)]\s+/gm, '').split(/(?<=[.!?。！？])\s+|\n+/u).filter(Boolean);
  const weight = parts.reduce((sum, text) => sum + text.length, 0);
  let elapsed = 0;
  return validateSubtitleCues(parts.map((text, index) => {
    const start = elapsed;
    elapsed = index === parts.length - 1 ? duration : elapsed + duration * text.length / weight;
    return { start: Math.round(start * 1000) / 1000, end: Math.round(elapsed * 1000) / 1000, text };
  }), duration);
}

export function createPresentationExportPlan(slides: readonly ExportSlide[]): { slides: PlannedSlide[]; captions: SubtitleCue[]; duration: number } {
  const ids = new Set<string>();
  let duration = 0;
  const captions: SubtitleCue[] = [];
  const planned = slides.filter(slide => slide.included).map(slide => {
    if (!slide.id || ids.has(slide.id) || !Number.isFinite(slide.duration) || slide.duration < .5 || slide.duration > 600) throw new Error('장표 ID와 재생 시간을 확인해 주세요.');
    ids.add(slide.id);
    const timing = planSlideTiming(slide);
    const local = timing.captions;
    const result = { ...slide, ...timing, offset: duration };
    captions.push(...local.map(cue => ({ ...cue, start: cue.start + duration, end: cue.end + duration })));
    duration += timing.duration;
    return result;
  });
  if (!planned.length || duration > 600) throw new Error('장표를 선택하고 전체 길이를 10분 이내로 설정해 주세요.');
  return { slides: planned, captions, duration };
}

export function serializeSrt(cues: readonly SubtitleCue[]): string {
  const stamp = (seconds: number): string => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`).join('\n\n') + (cues.length ? '\n' : '');
}
