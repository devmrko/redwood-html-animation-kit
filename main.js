import { createUiButton } from './vendor/foundation/ui-components.js';
import { createFullscreenControl } from './vendor/foundation/presentation-fullscreen.js';
import { createPositioningSlide } from './slides/positioning.js';
import { createFlowSlide } from './slides/flow.js';
import { createEffectsSlide } from './slides/effects.js';
import { createCatalogSlide } from './slides/catalog.js';
import { createChartsSlide } from './slides/charts.js';

await Reveal.initialize({width:1600,height:900,margin:0.025,hash:true,controls:false,progress:false,center:true,transition:'fade'});
const pauseButton = document.querySelector('#pause');
const stateLabel = document.querySelector('#playback-state');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const sidebar = document.querySelector('#toc');
const tocButton = document.querySelector('#toc-toggle');
const durations = [15,18,12,14,14,14,14,3];
let current = Reveal.getIndices().h;
function onState(index,state) {
  if(index!==current) return;
  const status = {idle:'재생 준비',running:`재생 중 · ${durations[index]}초`,paused:'일시정지',finished:'마지막 장면',destroyed:''};
  stateLabel.textContent = index>=2 && state==='running' ? '효과 재생 중' : index>=2 && state==='finished' ? '재생 완료 · 효과별 버튼으로 다시 재생' : status[state];
  pauseButton.textContent = state==='paused' ? '계속 재생' : '일시정지';
  pauseButton.disabled = state==='finished';
}
const factories = [
  ()=>createPositioningSlide(document.querySelector('#positioning'),state=>onState(0,state)),
  ()=>createFlowSlide(document.querySelector('#knowledge-flow'),state=>onState(1,state)),
  ()=>createEffectsSlide(document.querySelector('#effect-presets'),state=>onState(2,state)),
  ...['motion-effects','text-effects','svg-effects','metric-effects'].map((id,i)=>()=>createCatalogSlide(document.getElementById(id),state=>onState(i+3,state))),
  ()=>createChartsSlide(document.querySelector('#charts'),state=>onState(7,state)),
];
const slides = Array(factories.length).fill(null);
const getSlide = index=>slides[index]??=factories[index]();
const names = ['지식관리 구성','정보 흐름','기본 효과','동작 효과','텍스트 효과','SVG 효과','수치·배치','차트'];
const navButtons = names.map((label,index)=>{
  const button=createUiButton(document,{label});button.className='rf-sidebar__item';
  const number=document.createElement('span');number.className='rf-sidebar__number';number.textContent=String(index+1).padStart(2,'0');button.prepend(number);
  button.addEventListener('click',()=>{Reveal.slide(index);if(matchMedia('(max-width:800px)').matches){document.body.classList.remove('is-toc-open');tocButton.setAttribute('aria-expanded','false');}});
  document.querySelector('#page-navigation').append(button);return button;
});
function navigation(){
  document.querySelector('#page-number').textContent=`${current+1} / ${slides.length}`;
  previous.disabled=current===0;next.disabled=current===slides.length-1;
  navButtons.forEach((button,index)=>{if(index===current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
Reveal.on('slidechanged',()=>{getSlide(current).player.pause();current=Reveal.getIndices().h;navigation();getSlide(current).player.restart();});
previous.addEventListener('click',()=>Reveal.prev());next.addEventListener('click',()=>Reveal.next());
document.querySelector('#replay').addEventListener('click',()=>getSlide(current).player.restart());
pauseButton.addEventListener('click',()=>{const player=getSlide(current).player;if(player.state==='running')player.pause();else player.play();});
document.querySelector('#finish').addEventListener('click',()=>getSlide(current).player.finish());
tocButton.addEventListener('click',()=>{
  if(matchMedia('(max-width:800px)').matches){document.body.classList.toggle('is-toc-open');tocButton.setAttribute('aria-expanded',String(document.body.classList.contains('is-toc-open')));}
  else {document.body.classList.toggle('is-toc-collapsed');tocButton.setAttribute('aria-expanded',String(!document.body.classList.contains('is-toc-collapsed')));Reveal.layout();}
});
const fullscreen=createFullscreenControl({target:document.documentElement,button:document.querySelector('#fullscreen'),onChange:()=>Reveal.layout(),onError:error=>{stateLabel.textContent=`전체 화면 전환 실패: ${error instanceof Error ? error.message : String(error)}`;}});
window.addEventListener('pagehide',event=>{if(!event.persisted){slides.forEach(slide=>slide?.destroy());fullscreen.destroy();}});
navigation();getSlide(current).player.play();
