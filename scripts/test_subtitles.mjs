import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationExportPlan, planSlideTiming, subtitleReadingSeconds, serializeSrt, createSubtitleDraft } from '../vendor/foundation/presentation-subtitles.js';
import { describePresentationTracks, estimatePresentationMinimum } from '../vendor/foundation/presentation-context.js';
const slide = overrides => ({id:'a', title:'장표', notes:'', duration:4, included:true, captions:[{start:1,end:2,text:'긴 자막의 내용을 충분히 읽을 수 있도록 화면 전환을 늦춥니다.'}], ...overrides});

test('long subtitles extend both slide and captions without changing animation alignment',()=>{
 const input=slide(), result=planSlideTiming(input), cue=result.captions[0];
 assert.ok(result.duration>input.duration);
 assert.ok(cue.end-cue.start>=subtitleReadingSeconds(cue.text));
 assert.ok(Math.abs(cue.start*result.playbackRate-input.captions[0].start)<1e-9);
 assert.equal(input.duration,4);
});
test('manual timing and empty subtitles retain user duration',()=>{
 assert.equal(planSlideTiming(slide({autoReading:false})).duration,4);
 assert.equal(planSlideTiming(slide({captions:[]})).duration,4);
 assert.equal(planSlideTiming(slide({captions:[],duration:1,animationDuration:5})).duration,5);
});
test('SRT uses the same expanded plan and next-slide offsets as video',()=>{
 const plan=createPresentationExportPlan([slide(),slide({id:'excluded',included:false}),slide({id:'b',autoReading:false})]);
 assert.equal(plan.slides[1].offset,plan.slides[0].duration);
 assert.equal(plan.captions[1].start,plan.slides[0].duration+1);
 const srt=serializeSrt(plan.captions);
 assert.match(srt,/1\n00:00:\d\d,\d{3} --> 00:00:\d\d,\d{3}/);
 assert.ok(srt.includes(plan.captions[1].text));
});
test('overlap, non-finite values and expanded plans exceeding ten minutes fail',()=>{
 assert.throws(()=>createPresentationExportPlan([slide({captions:[{start:0,end:2,text:'a'},{start:1,end:3,text:'b'}]})]));
 assert.throws(()=>createPresentationExportPlan([slide({duration:NaN})]));
 assert.throws(()=>createPresentationExportPlan([slide({duration:600,captions:[{start:0,end:.1,text:'자막이 길면 전체 길이도 제한에 걸립니다.'}]})]));
});
test('animation context comes from the actual keyframe entrance and source text',()=>{
 const timing=describePresentationTracks(18000,[{element:{textContent:'질문에 맞는 답변'},keyframes:[{offset:0,opacity:0},{offset:12.4/18,opacity:0},{offset:13/18,opacity:1}]}]);
 assert.equal(timing.duration,18);
 assert.deepEqual(timing.events,[{at:12.4,text:'질문에 맞는 답변'}]);
});
test('visual minimum protects late elements and dense slides even without captions',()=>{
 const simple={content:'제목',events:[],animationDuration:1,elementCount:1};
 const late=estimatePresentationMinimum({...simple,events:[{at:12,text:'마지막 답변'}]});
 const dense=estimatePresentationMinimum({...simple,content:'본문 정보 '.repeat(80),elementCount:20});
 assert.ok(late>=13.5);
 assert.ok(dense>estimatePresentationMinimum(simple));
 assert.ok(estimatePresentationMinimum({...simple,stepCount:8})>=25);
 assert.ok(planSlideTiming(slide({captions:[],duration:4,minimumDuration:late})).duration>=late);
 assert.throws(()=>planSlideTiming(slide({minimumDuration:NaN})));
});
test('numbered script steps do not turn the numbers into separate captions',()=>{
 const cues=createSubtitleDraft('1. 자료를 등록합니다.\n2. 결과를 확인합니다.\n3. 저장합니다.',12);
 assert.equal(cues.length,3);assert.ok(cues.every(cue=>!/^\d+\.$/.test(cue.text)));
});
