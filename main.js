import { createUiButton } from './vendor/foundation/ui-components.js';
import { createPositioningSlide } from './slides/positioning.js';
import { createFlowSlide } from './slides/flow.js';
import { createEffectsSlide } from './slides/effects.js';
import { createCatalogSlide } from './slides/catalog.js';
import { createBookendSlide } from './slides/bookend.js';
import { createChartsSlide } from './slides/charts.js';

const query = new URLSearchParams(location.search);
const speakerPreview = query.has('receiver');
const audienceWindow = query.has('audience') && !speakerPreview;
document.body.classList.toggle('is-speaker-preview', speakerPreview);
document.body.classList.toggle('is-audience-window', audienceWindow);
if(audienceWindow) document.title = '발표 화면 — Redwood HTML Animation Kit';
await Reveal.initialize({plugins:[RevealNotes],width:1600,height:900,margin:0.025,hash:true,controls:false,progress:false,center:true,transition:'fade'});
document.querySelector('#presenter').addEventListener('click',()=>Reveal.getPlugin('notes').open());
Reveal.addKeyBinding({keyCode:70,key:'F',description:'발표 창 열기'},()=>{if(!audienceWindow)void openPresentationWindow();});
const pauseButton = document.querySelector('#pause');
const stateLabel = document.querySelector('#playback-state');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const sidebar = document.querySelector('#toc');
const tocButton = document.querySelector('#toc-toggle');
const pages = [
  {id:'cover',label:'표지',kind:'template',create:createBookendSlide},
  {id:'agenda-examples',label:'목차 · 구성 예제',kind:'template',create:createBookendSlide},
  {id:'positioning',label:'지식관리 구성',duration:15,create:createPositioningSlide},
  {id:'knowledge-flow',label:'정보 흐름',duration:18,create:createFlowSlide},
  {id:'agenda-effects',label:'목차 · 애니메이션 효과',kind:'template',create:createBookendSlide},
  {id:'effect-presets',label:'기본 효과',kind:'gallery',create:createEffectsSlide},
  ...[['motion-effects','동작 효과'],['text-effects','텍스트 효과'],['svg-effects','SVG 효과'],['metric-effects','수치·배치']].map(([id,label])=>({id,label,kind:'gallery',create:createCatalogSlide})),
  {id:'agenda-charts',label:'목차 · 차트',kind:'template',create:createBookendSlide},
  {id:'charts',label:'차트',kind:'gallery',create:createChartsSlide},
  {id:'closing',label:'마지막 장',kind:'template',create:createBookendSlide},
];
let current = Reveal.getIndices().h;
function onState(index,state) {
  if(index!==current) return;
  const page = pages[index];
  const status = {idle:'재생 준비',running:`재생 중 · ${page.duration}초`,paused:'일시정지',finished:'마지막 장면',destroyed:''};
  stateLabel.textContent = page.kind==='template' ? `${page.label} · ${state==='running' ? '재생 중' : state==='paused' ? '일시정지' : '재생 완료'}` : page.kind==='gallery' && state==='running' ? '효과 재생 중' : page.kind==='gallery' && state==='finished' ? '재생 완료 · 효과별 버튼으로 다시 재생' : status[state];
  pauseButton.textContent = state==='paused' ? '계속 재생' : '일시정지';
  pauseButton.disabled = state==='finished';
}
const slides = Array(pages.length).fill(null);
const getSlide = index=>slides[index]??=pages[index].create(document.getElementById(pages[index].id),state=>onState(index,state));
const names = pages.map(page=>page.label);
const navButtons = names.map((label,index)=>{
  const button=createUiButton(document,{label});button.className='rf-sidebar__item';
  const number=document.createElement('span');number.className='rf-sidebar__number';number.textContent=String(index+1).padStart(2,'0');button.prepend(number);
  button.addEventListener('click',()=>{Reveal.slide(index);if(matchMedia('(max-width:800px)').matches){document.body.classList.remove('is-toc-open');tocButton.setAttribute('aria-expanded','false');}});
  document.querySelector('#page-navigation').append(button);return button;
});
function navigation(){
  document.querySelector('#page-number').textContent=`${current+1} / ${slides.length}`;
  previous.disabled=current===0;next.disabled=current===slides.length-1;
  navButtons.forEach((button,index)=>{if(index===current){button.setAttribute('aria-current','page');button.scrollIntoView({block:'nearest'});}else button.removeAttribute('aria-current');});
}
Reveal.on('slidechanged',()=>{getSlide(current).player.pause();current=Reveal.getIndices().h;navigation();if(speakerPreview)getSlide(current).player.finish();else getSlide(current).player.restart();});
previous.addEventListener('click',()=>Reveal.prev());next.addEventListener('click',()=>Reveal.next());
document.querySelector('#replay').addEventListener('click',()=>getSlide(current).player.restart());
pauseButton.addEventListener('click',()=>{const player=getSlide(current).player;if(player.state==='running')player.pause();else player.play();});
document.querySelector('#finish').addEventListener('click',()=>getSlide(current).player.finish());
tocButton.addEventListener('click',()=>{
  if(matchMedia('(max-width:800px)').matches){document.body.classList.toggle('is-toc-open');tocButton.setAttribute('aria-expanded',String(document.body.classList.contains('is-toc-open')));}
  else {document.body.classList.toggle('is-toc-collapsed');tocButton.setAttribute('aria-expanded',String(!document.body.classList.contains('is-toc-collapsed')));Reveal.layout();}
});
async function openPresentationWindow() {
  const button = document.querySelector('#present');
  button.disabled = true;
  stateLabel.textContent = '발표 창 여는 중…';
  try {
    const response = await fetch('/api/presentation-window', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slide:pages[current].id,width:Math.round(screen.availWidth),height:Math.round(screen.availHeight),left:Math.round(screen.availLeft || 0),top:Math.round(screen.availTop || 0)}),
    });
    if(!response.ok) throw new Error(response.status===404 || response.status===501 ? 'start.py 서버를 다시 실행해 주세요.' : 'Edge 또는 Chrome으로 발표 창을 열지 못했습니다.');
    stateLabel.textContent = '별도 발표 창에서 S 키로 발표자 보기를 여세요.';
  } catch(error) {
    stateLabel.textContent = `발표 창 열기 실패: ${error instanceof Error ? error.message : String(error)}`;
  } finally { button.disabled = false; }
}
document.querySelector('#present').addEventListener('click',()=>{void openPresentationWindow();});
window.addEventListener('pagehide',event=>{if(!event.persisted){slides.forEach(slide=>slide?.destroy());}});
navigation();if(speakerPreview)getSlide(current).player.finish();else getSlide(current).player.play();
