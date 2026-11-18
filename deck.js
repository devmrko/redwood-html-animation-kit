import {loadPresentationAiPages,openPresentationAiEditor} from './ai-editor.js';
import {presentationTheme,projectSections} from './template-theme.js';
import {getAuthoredPages} from './authored-pages.js';
import {renderPresentationDocument} from './vendor/foundation/presentation-document-view.js';
import {openAppProjectStore} from './project-store.js';
import {validProjectId} from './vendor/foundation/presentation-document.js';
import {presentationPath} from './vendor/foundation/presentation-structure.js';
import {createPresentationWindowControl,createPresentationMirror} from './vendor/foundation/presentation-window.js';
import {createFlatPresentationLayout,createAdaptivePresentationToolbar} from './vendor/foundation/presentation-layout.js';
import {createEvidenceFigure,guardPresentationDialog} from './vendor/foundation/presentation-evidence.js';
import {launchPresentation,reportPresentationReady} from './presentation-launch.js';
import {openPresentationSearch,createPresentationShortcuts} from './vendor/foundation/presentation-search.js';
const query=new URLSearchParams(location.search),id=query.get('project'),preview=['preview','receiver','export-render'].some(key=>query.has(key)),flat=query.get('layout')!=='reveal';
const $=id=>document.getElementById(id);
document.body.classList.toggle('is-preview',preview);document.body.classList.toggle('is-audience',query.has('audience')&&!preview);document.body.dataset.layout=flat?'flat':'reveal';
try{
 if(!id||!validProjectId(id))throw Error('프로젝트를 선택해 주세요. 장표 편집에서 발표 화면을 열 수 있습니다.');
 const store=await openAppProjectStore(),project=await store.load(id);
 if(!project)throw Error('이 브라우저에 프로젝트가 없습니다. 장표 만들기에서 JSON을 불러와 주세요.');
 document.title=project.document.title;
 $('theme-mode').value=project.document.appearance||'light';$('theme-mode').onchange=async()=>{try{project.document.appearance=$('theme-mode').value;await store.save(project);location.reload();}catch(e){$('error').textContent=e.message;}};
 $('edit').href=`./builder.html?project=${id}`;$('export').href=`./export.html?project=${id}`;
 let current=0,mirror;
 function navigate(slideId){const index=project.document.slides.findIndex(s=>s.id===slideId);if(index>=0)Reveal.slide(index);}
 const authoredPages=new Map([...getAuthoredPages(id),...await loadPresentationAiPages(project)]);
 $('ai-edit').onclick=()=>{slides[current]?.player.pause();openPresentationAiEditor({project,slideId:project.document.slides[current].id,pages:authoredPages,onApplied:()=>location.reload()});};
 const rendered=renderPresentationDocument(project,$('document-slides'),presentationTheme,{pages:authoredPages,sections:projectSections(project.document),textMotion:!flat,navigate}),slides=rendered.slides;
 slides.forEach(slide=>slide.player.finish());
 await Reveal.initialize({plugins:[RevealNotes],width:1600,height:900,margin:0,center:false,hash:true,controls:false,progress:false,transition:'none',disableLayout:flat,keyboardCondition:()=>!document.querySelector('dialog[open]')});
 const toolbarLayout=createAdaptivePresentationToolbar(document.querySelector('.deck-toolbar'),{property:'--deck-toolbar-height',onResize:()=>Reveal.layout()});
 const fit=flat?createFlatPresentationLayout(document.querySelector('.reveal'),$('document-slides')):null;
 const find=()=>{slides[current]?.player.pause();$('pause').textContent='계속 재생';openPresentationSearch(document,project,navigate,new Map(slides.map(s=>[s.root.id,s.metadata().content])));};
 const saveProject=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='presentation-project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
 $('find').onclick=find;$('save-project').onclick=saveProject;const removeShortcuts=createPresentationShortcuts(document,{find,save:saveProject});
 current=Reveal.getIndices().h;
 function status(){
  const s=slides[current],data=project.document.slides[current];$('pause').textContent=s?.player.state==='running'?'일시정지':s?.player.state==='finished'?'재생':'계속 재생';$('page-number').textContent=`${current+1} / ${slides.length}`;$('state').textContent=s?.stepCount?`단계 ${s.step} / ${s.stepCount}`:'';
  $('previous').disabled=current===0&&(!s?.stepCount||s.step<=1);$('next').disabled=current===slides.length-1&&(!s?.stepCount||s.step>=s.stepCount);$('parent').disabled=!data.parentId;
  $('evidence').disabled=!data.evidenceIds?.length;$('evidence').textContent=`증거 ${data.evidenceIds?.length||0}`;
  $('breadcrumbs').replaceChildren();for(const part of presentationPath(project.document.slides,data.id)){const button=document.createElement('button');button.textContent=part.title;button.disabled=part.id===data.id;button.onclick=()=>navigate(part.id);$('breadcrumbs').append(button);}
 }
 function dialog(title){const node=document.createElement('dialog');node.className='deck-dialog';node.setAttribute('aria-label',title);guardPresentationDialog(node);const heading=document.createElement('h2');heading.textContent=title;const close=document.createElement('button');close.textContent='닫기';close.onclick=()=>node.close();node.append(close,heading);node.addEventListener('close',()=>node.remove(),{once:true});document.body.append(node);return node;}
 $('toc').onclick=()=>{const list=dialog('전체 장표');for(const slide of project.document.slides){const button=document.createElement('button');button.className='deck-toc-item';button.style.paddingLeft=`${20+(presentationPath(project.document.slides,slide.id).length-1)*20}px`;button.textContent=`${slide.title}${slide.role==='detail'?' · 상세':slide.role==='appendix'?' · 부록':''}`;button.onclick=()=>{navigate(slide.id);list.close();};list.append(button);}list.showModal();};
 $('parent').onclick=()=>navigate(project.document.slides[current].parentId);
 $('evidence').onclick=()=>{const node=dialog('관련 증거');for(const key of project.document.slides[current].evidenceIds??[]){const entry=project.evidence?.find(e=>e.id===key);if(entry)node.append(createEvidenceFigure(document,entry));}node.showModal();};
 $('document-slides').addEventListener('presentationstepchange',status);
 function next(){if(mirror?.sendCommand('next'))return;const s=slides[current];if(s.stepCount&&s.step<s.stepCount){s.goToStep(s.step+1);status();}else Reveal.next();}
 function previous(){if(mirror?.sendCommand('previous'))return;const s=slides[current];if(s.stepCount&&s.step>1){s.goToStep(s.step-1);status();}else Reveal.prev();}
 Reveal.on('slidechanged',()=>{slides[current]?.player.pause();current=Reveal.getIndices().h;if(preview)slides[current].player.finish();else slides[current].player.restart();status();fit?.layout();});
 $('next').onclick=next;$('previous').onclick=previous;
 Reveal.addKeyBinding({keyCode:39,key:'Right',description:'다음 단계·장표'},next);Reveal.addKeyBinding({keyCode:37,key:'Left',description:'이전 단계·장표'},previous);Reveal.addKeyBinding({keyCode:32,key:'Space',description:'다음 단계·장표'},next);
 function replay(){if(mirror?.sendCommand('replay'))return;slides[current].player.restart();status();} function togglePause(){if(mirror?.sendCommand('pause'))return;const p=slides[current].player;if(p.state==='running'){p.pause();$('pause').textContent='계속 재생';}else{p.play();$('pause').textContent='일시정지';}} $('replay').onclick=replay;$('pause').onclick=togglePause;Reveal.addKeyBinding({keyCode:80,key:'P',description:'재생·일시정지'},togglePause);Reveal.addKeyBinding({keyCode:82,key:'R',description:'다시 재생'},replay);
 $('presenter').onclick=()=>Reveal.getPlugin('notes').open();$('layout-mode').value=flat?'flat':'reveal';$('layout-mode').onchange=()=>{const url=new URL(location.href);url.searchParams.set('layout',$('layout-mode').value);location.href=url.href;};
 const windowControl=createPresentationWindowControl({button:$('present'),request:()=>({project:id,slide:project.document.slides[current].id,width:Math.round(screen.availWidth),height:Math.round(screen.availHeight),left:Math.round(screen.availLeft||0),top:Math.round(screen.availTop||0)}),launch:request=>launchPresentation(request,$('window-mode').value),onState:(state,error)=>{$('state').textContent=state==='opened'?'청중 창 준비 완료. 그 창에서 발표자 보기를 여세요.':state==='opening'?'청중 창 준비 확인 중…':String(error?.message||error);}});
 window.presentationDeck={getSlideElement:slideId=>slides.find(s=>s.root.id===slideId)?.root,getSlides:()=>slides.map(slide=>slide.metadata()),showSlide:(slideId,play=false,rate=1)=>{const index=project.document.slides.findIndex(s=>s.id===slideId);if(index<0)throw Error('장표를 찾을 수 없습니다.');Reveal.slide(index);const p=slides[index].player;p.setPlaybackRate(rate);if(play)p.restart();else p.finish();status();},pause:()=>slides[current].player.pause()};
 const receiver=query.has('receiver')&&window.frameElement?.parentElement?.id==='current-slide';
 mirror=createPresentationMirror({view:window,project:id,peer:receiver?window.parent.opener:undefined,acceptReceiver:sender=>sender.parent.opener===window&&sender.frameElement?.parentElement?.id==='current-slide',state:()=>({id:project.document.slides[current].id,time:slides[current].player.currentTime}),apply:state=>{const index=project.document.slides.findIndex(s=>s.id===state.id);if(index<0)return;Reveal.slide(index);slides[index].player.seek(state.time);status();},command:name=>({next,previous,pause:togglePause,replay})[name]()});
 const requested=query.get('slide');if(requested)window.presentationDeck.showSlide(requested);else if(preview)slides[current].player.finish();else slides[current].player.play();status();fit?.layout();reportPresentationReady();if(query.has('ai-edit')&&!preview)$('ai-edit').click();
 window.addEventListener('pagehide',()=>{rendered.destroy();toolbarLayout.destroy();fit?.destroy();mirror?.destroy();removeShortcuts();windowControl.destroy();store.close();},{once:true});
}catch(error){$('error').textContent=error.message;reportPresentationReady(error.message);}
