import { presentationTheme, projectSections } from './template-theme.js';
import { getAuthoredPages } from './authored-pages.js';
import { renderPresentationDocument } from './vendor/foundation/presentation-document-view.js';
import { openAppProjectStore } from './project-store.js';
import { validProjectId } from './vendor/foundation/presentation-document.js';
import { createPresentationWindowControl } from './vendor/foundation/presentation-window.js';
const query=new URLSearchParams(location.search),id=query.get('project'),preview=['preview','receiver','export-render'].some(key=>query.has(key));
const $=id=>document.getElementById(id);
document.body.classList.toggle('is-preview',preview);document.body.classList.toggle('is-audience',query.has('audience')&&!preview);
try{
 if(!id||!validProjectId(id))throw Error('프로젝트를 선택해 주세요. 장표 편집에서 발표 화면을 열 수 있습니다.');
 const store=await openAppProjectStore(),project=await store.load(id);
 if(!project)throw Error('이 브라우저에 프로젝트가 없습니다. 장표 만들기에서 JSON을 불러와 주세요.');
 document.title=project.document.title;
 $('edit').href=`./builder.html?project=${id}`;$('export').href=`./export.html?project=${id}`;
 const rendered=renderPresentationDocument(project,$('document-slides'),presentationTheme,{pages:getAuthoredPages(id)}),slides=rendered.slides;
 slides.forEach(slide=>slide.player.finish());
 await Reveal.initialize({plugins:[RevealNotes],width:1600,height:900,margin:0,center:false,hash:true,controls:false,progress:false,transition:'none'});
 let current=Reveal.getIndices().h;
 function status(){const s=slides[current];$('page-number').textContent=`${current+1} / ${slides.length}`;$('state').textContent=s?.stepCount?`단계 ${s.step} / ${s.stepCount}`:'';$('previous').disabled=current===0&&(!s?.stepCount||s.step<=1);$('next').disabled=current===slides.length-1&&(!s?.stepCount||s.step>=s.stepCount);}
 $('document-slides').addEventListener('presentationstepchange',status);
 function next(){const s=slides[current];if(s.stepCount&&s.step<s.stepCount){s.goToStep(s.step+1);status();}else Reveal.next();}
 function previous(){const s=slides[current];if(s.stepCount&&s.step>1){s.goToStep(s.step-1);status();}else Reveal.prev();}
 Reveal.on('slidechanged',()=>{slides[current]?.player.pause();current=Reveal.getIndices().h;if(preview)slides[current].player.finish();else slides[current].player.restart();status();});
 $('next').onclick=next;$('previous').onclick=previous;
 Reveal.addKeyBinding({keyCode:39,key:'Right',description:'다음 단계·장표'},next);Reveal.addKeyBinding({keyCode:37,key:'Left',description:'이전 단계·장표'},previous);Reveal.addKeyBinding({keyCode:32,key:'Space',description:'다음 단계·장표'},next);
 $('replay').onclick=()=>{slides[current].player.restart();status();};$('pause').onclick=()=>{const p=slides[current].player;if(p.state==='running'){p.pause();$('pause').textContent='계속 재생';}else{p.play();$('pause').textContent='일시정지';}};
 $('presenter').onclick=()=>Reveal.getPlugin('notes').open();
 const windowControl=createPresentationWindowControl({button:$('present'),request:()=>({project:id,slide:project.document.slides[current].id,width:Math.round(screen.availWidth),height:Math.round(screen.availHeight),left:Math.round(screen.availLeft||0),top:Math.round(screen.availTop||0)}),launch:async request=>{const response=await fetch('/api/presentation-window',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});if(!response.ok)throw Error('start.py 서버와 Edge/Chrome 설치를 확인해 주세요.');},onState:(state,error)=>{$('state').textContent=state==='opened'?'새 발표 창에서 발표자 보기를 여세요.':state==='opening'?'발표 창 여는 중…':String(error?.message||error);}});
 window.presentationDeck={getSlides:()=>slides.map(slide=>slide.metadata()),showSlide:(slideId,play=false,rate=1)=>{const index=project.document.slides.findIndex(s=>s.id===slideId);if(index<0)throw Error('장표를 찾을 수 없습니다.');Reveal.slide(index);const p=slides[index].player;p.setPlaybackRate(rate);if(play)p.restart();else p.finish();status();},pause:()=>slides[current].player.pause()};
 const requested=query.get('slide');if(requested)window.presentationDeck.showSlide(requested);else if(preview)slides[current].player.finish();else slides[current].player.play();status();
 window.addEventListener('pagehide',()=>{rendered.destroy();windowControl.destroy();store.close();},{once:true});
}catch(error){$('error').textContent=error.message;}
