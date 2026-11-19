/** Real browser integration of the same galleries used by samples.html. No model call. */
import {createEffectsSlide} from '../slides/effects.js';
import {createCatalogSlide} from '../slides/catalog.js';
import {createChartsSlide} from '../slides/charts.js';
import {createAiPresentationPage} from '../vendor/foundation/presentation-ai-page.js';
import {renderPresentationDocument} from '../vendor/foundation/presentation-document-view.js';
import {presentationTheme} from '../template-theme.js';
const stage=document.querySelector('#stage'),summary=document.querySelector('#summary'),results=document.querySelector('#results'),run=document.querySelector('#run');
const groups=[['effect-presets',createEffectsSlide],...['motion-effects','text-effects','svg-effects','metric-effects'].map(id=>[id,createCatalogSlide]),['charts',createChartsSlide]];
let source,active;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
function mount(id,factory){active?.destroy();const root=source.getElementById(id).cloneNode(true);root.classList.add('present');root.dataset.template='oracle-corporate';root.dataset.appearance='light';stage.replaceChildren(root);active=factory(root,()=>{});return {root,player:active.player};}
function appearanceState(root){return JSON.stringify([...root.querySelectorAll('*')].map(el=>{const css=getComputedStyle(el),box=el.getBoundingClientRect();return [el.textContent,css.opacity,css.transform,css.translate,css.scale,css.rotate,css.clipPath,css.boxShadow,css.strokeDashoffset,css.strokeDasharray,el.getAttribute('stroke-dasharray'),el.getAttribute('stroke-dashoffset'),box.width,box.height,el.getAttribute('d')];}));}
run.onclick=async()=>{
 run.disabled=true;results.replaceChildren();let passed=0,total=0;const records=[];
 try{
  source=new DOMParser().parseFromString(await fetch('./index.html',{cache:'no-store'}).then(r=>r.text()),'text/html');await document.fonts.ready;
  for(const [id,factory] of groups){
   const buttons=[...source.getElementById(id).querySelectorAll('[data-effect-play],[data-chart-play]')];
   for(const original of buttons){
    total++;const attribute=original.hasAttribute('data-effect-play')?'data-effect-play':'data-chart-play',key=original.getAttribute(attribute),label=original.getAttribute('aria-label');let error='';
    try{
     const {root,player}=mount(id,factory),trigger=root.querySelector(`[${attribute}="${key}"]`);trigger.click();player.pause();
     const ms=player.describe().duration*1000;assert(Number.isFinite(ms)&&ms>0,'재생 시간 오류');
     player.seek(0);const start=appearanceState(root);player.seek(ms*.5);const middle=appearanceState(root);assert(start!==middle,'중간 시각에 화면 변화 없음');
     assert(Math.abs(player.currentTime-ms*.5)<3,'탐색 시각 불일치');
     player.setPlaybackRate(2);player.play();player.pause();assert(player.state!=='running','일시정지 실패');
     player.seek(ms);assert(player.state==='finished','마지막 시각 상태 오류');
     player.restart();player.pause();player.finish();assert(player.state==='finished','전체 다시 재생/마지막 장면 오류');
     player.destroy();player.destroy();assert(player.state==='destroyed','해제 실패');passed++;
    }catch(e){error=e.message;}finally{active?.destroy();active=undefined;}
    const row=document.createElement('tr'),name=document.createElement('td'),state=document.createElement('td'),action=document.createElement('td'),view=document.createElement('button');name.textContent=label;state.textContent=error||'통과 · 재생/탐색/일시정지/완료/해제';state.className=error?'failed':'passed';view.textContent='보기';view.onclick=()=>{const {root}=mount(id,factory);root.querySelector(`[${attribute}="${key}"]`).click();};action.append(view);row.append(name,state,action);results.append(row);records.push({id,key,error});summary.textContent=`검사 중 · ${passed}/${total}`;
   }
  }
  const projectId=new URLSearchParams(location.search).get('project');let aiPassed=0,aiTotal=0;
  if(projectId){
   const response=await fetch(`/api/ai/projects/${encodeURIComponent(projectId)}/state`,{cache:'no-store'});assert(response.ok,'AI 검증 자료를 읽지 못했습니다.');const {snapshot}=await response.json();
   for(const appearance of ['light','dark'])for(const [id,page] of Object.entries(snapshot.pages)){
    aiTotal++;let error='';active?.destroy();active=undefined;let rendered;
    try{
     const project=structuredClone(snapshot.project);project.document.appearance=appearance;rendered=renderPresentationDocument(project,stage,presentationTheme,{slideId:id,pages:new Map([[id,createAiPresentationPage(page)]]),textMotion:false});
     const slide=rendered.slides[0];slide.player.finish();await Promise.all([...stage.querySelectorAll('img')].map(image=>image.decode()));
     assert(!slide.root.querySelector('section'),'중첩 section이 Reveal의 별도 장표가 됩니다.');
     const body=slide.root.querySelector('.rf-document-body').getBoundingClientRect();
     for(const el of slide.root.querySelector('.rf-ai-body').children){const box=el.getBoundingClientRect();assert(box.left>=body.left-3&&box.right<=body.right+3&&box.top>=body.top-3&&box.bottom<=body.bottom+3,'본문 구성요소가 템플릿 영역을 벗어납니다.');}
     for(const image of slide.root.querySelectorAll('.rf-ai-body img'))assert(image.naturalWidth>0,'사진을 읽지 못했습니다.');
     slide.player.seek(0);const start=appearanceState(slide.root);slide.player.seek(slide.player.describe().duration*500);assert(start!==appearanceState(slide.root),'AI 효과가 화면에 반영되지 않습니다.');slide.player.finish();aiPassed++;
    }catch(e){error=e.message;}finally{rendered?.destroy();}
    const row=document.createElement('tr'),name=document.createElement('td'),state=document.createElement('td');name.textContent=`AI ${id} · ${appearance}`;state.textContent=error||'통과 · 이미지/영역/장표 경계/타임라인';state.className=error?'failed':'passed';row.append(name,state,document.createElement('td'));results.append(row);records.push({id,appearance,error});
   }
  }
  summary.textContent=`${passed}/${total} 통과${aiTotal?` · AI ${aiPassed}/${aiTotal} 통과`:''} · 동작 줄이기 설정 ${matchMedia('(prefers-reduced-motion: reduce)').matches?'켜짐':'꺼짐'}`;
  const link=document.createElement('a');link.textContent='검사 결과 JSON 저장';link.download='browser-smoke.json';link.href=URL.createObjectURL(new Blob([JSON.stringify({passed,total,aiPassed,aiTotal,records},null,2)],{type:'application/json'}));summary.append(' · ',link);mount('charts',createChartsSlide).player.finish();
 }catch(error){summary.textContent=error.message;}finally{run.disabled=false;}
};
