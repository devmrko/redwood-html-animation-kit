import {createAppAiConnection} from './ai-connection.js';
import {captureEditablePresentationSlide} from './vendor/foundation/presentation-powerpoint-editable.js';
import {createPresentationPowerPoint,capturePresentationPowerPointSlide} from './vendor/foundation/presentation-powerpoint.js';
import { createSubtitleDraft, createPresentationExportPlan, serializeSrt, validateSubtitleCues, planSlideTiming } from './vendor/foundation/presentation-subtitles.js';
import { validProjectId } from './vendor/foundation/presentation-document.js';
import { recordPresentationVideo } from './vendor/foundation/presentation-video.js';
const $=id=>document.getElementById(id), frame=$('deck'), status=$('status');
const aiConnection=createAppAiConnection(()=>{$('llm-info').textContent=aiConnection.description();});$('ai-connection').append(aiConnection.root);aiConnection.ready.catch(()=>{});
let slides=[], selected=0, capabilities={}, busy=false, aborter;
const projectId=new URLSearchParams(location.search).get('project');
const storageKey=`redwood-video-export-v1${projectId?`:${projectId}`:''}`;
let deckReady=Promise.resolve();
if(projectId){if(!validProjectId(projectId))throw Error('프로젝트 ID를 확인해 주세요.');deckReady=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));frame.src=`./deck.html?project=${projectId}&export-render`;document.querySelector('.export-header a').href=`./deck.html?project=${projectId}`;}
const message=text=>{status.textContent=text;};
const selectedSlide=()=>slides[selected];
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({version:1,slides}));}catch{}};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({error:'start.py 서버를 다시 실행해 주세요.'}));if(!r.ok)throw Error(data.error||'요청에 실패했습니다.');return data;}
function setBusy(value){busy=value;aiConnection.setDisabled(value);document.querySelectorAll('.setup button,.setup input,.setup textarea,.export-actions button,.export-actions input,.export-actions select').forEach(el=>{el.disabled=value;});$('cancel').disabled=true;}
function summary(){try{const s=selectedSlide();if(s){const t=planSlideTiming(s);document.querySelectorAll('.cue-timing').forEach((el,i)=>{const c=t.captions[i];el.textContent=c?`적용 ${c.start.toFixed(1)}–${c.end.toFixed(1)}초 (${(c.end-c.start).toFixed(1)}초 표시)`:'';});$('timing-info').textContent=`적용 시간 ${t.duration.toFixed(1)}초 · 화면 최소 ${s.minimumDuration.toFixed(1)}초 · ${s.autoReading!==false?'자동 읽기 시간':'수동 시간'}${t.timeScale>1?` · 애니메이션·자막 ${t.timeScale.toFixed(2)}배 길이`:''}`;}const plan=createPresentationExportPlan(slides);$('total').textContent=`${plan.slides.length}장 · ${plan.duration.toFixed(1)}초`;}catch(error){$('total').textContent=error.message;}}
function renderList(){const list=$('slide-list');list.replaceChildren();slides.forEach((slide,index)=>{const row=document.createElement('div');row.className='slide-item';row.setAttribute('aria-current',String(index===selected));const check=document.createElement('input');check.type='checkbox';check.checked=slide.included;check.setAttribute('aria-label',`${slide.title} 포함`);check.onchange=()=>{slide.included=check.checked;if(index===selected)$('included').checked=check.checked;summary();save();};const button=document.createElement('button');button.textContent=`${String(index+1).padStart(2,'0')} ${slide.title}`;button.onclick=()=>{selected=index;render();};row.append(check,button);list.append(row);});}
function renderCues(){const list=$('cue-list');list.replaceChildren();selectedSlide().captions.forEach((cue,index)=>{const row=document.createElement('div');row.className='cue';for(const [key,label] of [['start','시작(초)'],['end','끝(초)']]){const field=document.createElement('label');field.textContent=label;const input=document.createElement('input');input.type='number';input.min='0';input.step='.1';input.value=String(cue[key]);input.setAttribute('aria-label',`${index+1}번 자막 ${label}`);input.onchange=()=>{cue[key]=Number(input.value);summary();save();};field.append(input);row.append(field);}const text=document.createElement('textarea');text.value=cue.text;text.rows=2;text.setAttribute('aria-label',`${index+1}번 자막 문구`);text.oninput=()=>{cue.text=text.value;summary();save();};const remove=document.createElement('button');remove.textContent='삭제';remove.onclick=()=>{selectedSlide().captions.splice(index,1);renderCues();summary();save();};const timing=document.createElement('small');timing.className='cue-timing';row.append(text,remove,timing);list.append(row);});}
function render(){if(!slides.length)return;renderList();const slide=selectedSlide();$('slide-title').textContent=slide.title;$('included').checked=slide.included;$('duration').value=String(slide.duration);$('auto-reading').checked=slide.autoReading!==false;$('notes').value=slide.notes;$('preview-caption').textContent=slide.title;renderCues();summary();frame.contentWindow.presentationDeck.showSlide(slide.id);}
$('auto-reading').onchange=()=>{selectedSlide().autoReading=$('auto-reading').checked;summary();save();};
$('included').onchange=()=>{selectedSlide().included=$('included').checked;renderList();summary();save();};
$('duration').onchange=()=>{selectedSlide().duration=Number($('duration').value);summary();save();};
$('notes').oninput=()=>{selectedSlide().notes=$('notes').value;save();};
$('select-all').onclick=()=>{slides.forEach(s=>s.included=true);render();save();};
$('select-none').onclick=()=>{slides.forEach(s=>s.included=false);render();save();};
$('draft').onclick=()=>{try{const s=selectedSlide();s.captions=createSubtitleDraft(s.notes||s.title,s.duration);renderCues();summary();save();message('노트에서 자막 초안을 만들었습니다. 문구와 시간을 수정할 수 있습니다.');}catch(e){message(e.message);}};
$('add-cue').onclick=()=>{const s=selectedSlide(),start=s.captions.at(-1)?.end||0;if(start>=s.duration)return message('남은 시간이 없습니다. 앞 자막의 끝 시간을 먼저 줄여 주세요.');s.captions.push({start,end:s.duration,text:'자막을 입력하세요.'});renderCues();summary();save();};
$('llm').onclick=async()=>{setBusy(true);message('선택한 장표의 본문·발표 노트·등장 시각으로 LLM 자막을 만들고 있습니다…');try{await aiConnection.ready;const s=selectedSlide(),r=await api('/api/subtitles/draft',{connection:aiConnection.value(),title:s.title,content:s.content,notes:s.notes,events:s.events.filter(e=>e.at<=s.duration),duration:s.duration});s.captions=validateSubtitleCues(r.captions,s.duration);renderCues();summary();save();message(`${r.model} 초안입니다. 문구와 시간을 확인하고 수정해 주세요.`);}catch(e){message(e.message);}finally{setBusy(false);}};
$('save-plan').onclick=()=>{try{createPresentationExportPlan(slides);download(new Blob([JSON.stringify({version:1,slides},null,2)],{type:'application/json'}),'presentation-plan.json');}catch(e){message(e.message);}};
$('load-plan').onchange=async()=>{try{const file=$('load-plan').files[0];if(!file)return;if(file.size>256000)throw Error('편집 설정은 256KB 이하여야 합니다.');const saved=JSON.parse(await file.text());if(saved.version!==1||!Array.isArray(saved.slides))throw Error('지원하지 않는 편집 설정입니다.');const map=new Map(saved.slides.map(s=>[s.id,s]));const replacement=slides.map(s=>{const v=map.get(s.id);if(!v)return s;if(typeof v.notes!=='string'||v.notes.length>6000||typeof v.included!=='boolean')throw Error('편집 설정 형식이 올바르지 않습니다.');return {...s,notes:v.notes,duration:v.duration,autoReading:v.autoReading!==false,captions:validateSubtitleCues(v.captions,v.duration),included:v.included};});createPresentationExportPlan(replacement);slides=replacement;render();save();message('편집 설정을 불러왔습니다.');}catch(e){message(e.message);}};
$('save-pptx').onclick=async()=>{
 if(busy)return;
 const selectedSlides=slides.filter(s=>s.included),editable=$('pptx-mode').value==='editable';if(!selectedSlides.length)return message('PPT에 포함할 장표를 선택해 주세요.');
 if(!window.PptxGenJS||!window.htmlToImage)return message('PPT 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
 aborter=new AbortController();const signal=aborter.signal;setBusy(true);$('cancel').disabled=false;$('capture-surface').scrollIntoView({block:'center'});message('PPT 장표를 만들고 있습니다…');
 try{
  const deck=frame.contentWindow.presentationDeck;
  const blob=await createPresentationPowerPoint({slides:selectedSlides,signal,createWriter:()=>new window.PptxGenJS(),render:async id=>{deck.showSlide(id);deck.pause();const root=deck.getSlideElement(id);if(!root)throw Error('장표 화면을 찾을 수 없습니다.');return (editable?captureEditablePresentationSlide:capturePresentationPowerPointSlide)(root,frame.contentWindow.htmlToImage?.toPng||window.htmlToImage.toPng);},onProgress:(done,total)=>message(done===total?'PPT 파일로 묶고 있습니다…':`PPT 장표 생성 · ${done+1} / ${total}`)});
  if(signal.aborted)throw new DOMException('취소했습니다.','AbortError');
  download(blob,'presentation.pptx');message(`${selectedSlides.length}장 PPT를 저장했습니다. ${editable?'텍스트·표·기본 도형을 편집할 수 있습니다.':'화면은 정지 이미지입니다.'} 발표 노트가 포함됩니다.`);
 }catch(e){message(e.name==='AbortError'?'PPT 저장을 취소했습니다.':e.message);}finally{frame.contentWindow.presentationDeck.showSlide(selectedSlide().id);setBusy(false);}
};
$('save-srt').onclick=()=>{try{const plan=createPresentationExportPlan(slides);if(!plan.captions.length)throw Error('선택한 장표에 자막이 없습니다. 먼저 자막을 작성해 주세요.');download(new Blob([serializeSrt(plan.captions)],{type:'application/x-subrip;charset=utf-8'}),'subtitles.srt');message(`${plan.slides.length}장 · ${plan.duration.toFixed(1)}초 영상 기준 SRT를 저장했습니다.`);}catch(e){message(e.message);}};
function wait(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('취소했습니다.','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
$('cancel').onclick=()=>aborter?.abort();
$('record').onclick=async()=>{
 if(busy)return;
 let plan;try{if(slides.some(s=>s.included&&s.remoteMedia))throw Error('YouTube 영상이 있는 장표는 MP4로 내보낼 수 없습니다. 해당 장표를 제외하거나 로컬 MP4·WebM으로 바꿔 주세요. SRT는 저장할 수 있습니다.');plan=createPresentationExportPlan(slides);if(!capabilities.ffmpeg)throw Error('FFmpeg를 설치하고 start.py 서버를 다시 실행해 주세요.');}catch(e){message(e.message);return;}
 aborter=new AbortController();const signal=aborter.signal,mode=$('subtitle-mode').value;
 setBusy(true);$('cancel').disabled=false;document.body.classList.add('recording');$('downloads').replaceChildren();frame.contentWindow.presentationDeck.showSlide(plan.slides[0].id);$('capture-surface').scrollIntoView({block:'center'});
 try{
  message('공유 창에서 현재 «영상 내보내기» 탭을 선택해 주세요.');
  const blob=await recordPresentationVideo({surface:$('capture-surface'),signal,captions:plan.captions,burnCaptions:mode==='burn',onTime:t=>message(`녹화 중 · ${Math.min(t,plan.duration).toFixed(1)} / ${plan.duration.toFixed(1)}초`),run:async()=>{for(const slide of plan.slides){if(signal.aborted)throw new DOMException('취소했습니다.','AbortError');$('preview-caption').textContent=slide.title;frame.contentWindow.presentationDeck.showSlide(slide.id,true,slide.playbackRate);await wait(slide.duration*1000,signal);}}});
  frame.contentWindow.presentationDeck.pause();$('cancel').disabled=true;message('MP4로 변환하고 있습니다…');
  // Keep the browser recording available even if the local conversion subsequently fails.
  const webm=document.createElement('button');webm.textContent='녹화 원본 WebM 저장';webm.onclick=()=>download(blob,'presentation.webm');$('downloads').append(webm);
  const job=await api('/api/video-exports',{duration:plan.duration,captions:mode==='none'?[]:plan.captions,subtitleMode:mode});
  const upload=await fetch(`/api/video-exports/${job.id}/recording`,{method:'POST',headers:{'Content-Type':'video/webm'},body:blob});if(!upload.ok)throw Error((await upload.json()).error||'업로드에 실패했습니다.');
  let result;for(let i=0;i<900;i++){result=await fetch(`/api/video-exports/${job.id}`).then(r=>r.json());if(result.state==='ready')break;if(result.state==='failed')throw Error(result.error);await new Promise(r=>setTimeout(r,1000));}
  if(result?.state!=='ready')throw Error('변환 대기 시간이 초과됐습니다.');
  const videoLink=document.createElement('a');videoLink.href=`/api/video-exports/${job.id}/presentation.mp4`;videoLink.textContent='MP4 저장';videoLink.download='presentation.mp4';$('downloads').prepend(videoLink);
  if(plan.captions.length&&mode!=='none'){const link=document.createElement('a');link.href=`/api/video-exports/${job.id}/subtitles.srt`;link.textContent='SRT 자막 저장';link.download='subtitles.srt';$('downloads').append(link);}
  message('영상이 준비됐습니다. MP4와 자막을 저장하세요.');
 }catch(e){message(e.name==='AbortError'?'녹화를 취소했습니다.':e.message);}finally{aborter.abort();frame.contentWindow.presentationDeck.pause();document.body.classList.remove('recording');setBusy(false);}
};
async function initialize(){
 await deckReady;
 for(let i=0;i<200&&!frame.contentWindow?.presentationDeck;i++)await new Promise(r=>setTimeout(r,50));
 if(!frame.contentWindow?.presentationDeck)throw Error('장표를 불러오지 못했습니다. 새로고침해 주세요.');
 slides=frame.contentWindow.presentationDeck.getSlides().map(s=>({...s,included:true,autoReading:true,captions:createSubtitleDraft(s.notes,s.duration)}));
 try{const stored=JSON.parse(localStorage.getItem(storageKey));if(stored?.version===1){const map=new Map(stored.slides.map(s=>[s.id,s]));slides=slides.map(s=>{const v=map.get(s.id);if(!v||typeof v.notes!=='string'||typeof v.included!=='boolean')return s;return {...s,notes:v.notes,duration:v.duration,included:v.included,autoReading:v.autoReading!==false,captions:validateSubtitleCues(v.captions,v.duration)};});}}catch{}
 capabilities=await fetch('/api/export-capabilities').then(r=>r.json()).catch(()=>({}));
 await aiConnection.ready.catch(()=>{});$('llm-info').textContent=aiConnection.description();render();message('장표를 선택해 시간과 자막을 수정한 뒤 영상 만들기를 누르세요.');
}
initialize().catch(e=>message(e.message));
