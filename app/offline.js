import {createAdaptivePresentationToolbar} from '../vendor/foundation/presentation-layout.js';
import {openOfflineAi} from './offline-ai.js';
import {renderPresentationDocument} from '../vendor/foundation/presentation-document-view.js';
import {createAiPresentationPage} from '../vendor/foundation/presentation-ai-page.js';
import {createEvidenceFigure,guardPresentationDialog} from '../vendor/foundation/presentation-evidence.js';
import {openPresentationSearch,createPresentationShortcuts,presentationPlaybackCommand} from '../vendor/foundation/presentation-search.js';
import {presentationTheme,projectSections} from './template-theme.js';
import {getAuthoredPages} from '../authored-pages.js';
import {openPresentationPopup,notifyPresentationReady,createPresentationPeerSession} from '../vendor/foundation/presentation-window.js';

const {project,pages}=JSON.parse(document.getElementById('offline-data').textContent),query=new URLSearchParams(location.search),$=id=>document.getElementById('offline-'+id),speakerMode=query.has('speaker');
const ownerUrl=new URL(location.href),ownerSession=query.get('presentationSession')||crypto.randomUUID();
ownerUrl.searchParams.set('presentationSession',ownerSession);history.replaceState(null,'',ownerUrl.href);
const factories=new Map([...getAuthoredPages(project.document.id),...Object.entries(pages).map(([id,page])=>[id,createAiPresentationPage(page)])]);
const rendered=renderPresentationDocument(project,$('slides'),presentationTheme,{pages:factories,sections:projectSections(project.document),textMotion:false,navigate:id=>navigate(id)}),views=rendered.slides;
let current=0,session,audienceWindow,applying=false,openingSpeaker=false,openingAudience=false,mirroredState;
document.body.classList.toggle('offline-speaker',speakerMode);document.body.classList.toggle('offline-audience',query.has('audience'));views.forEach(s=>s.player.finish());
if(query.has('audience'))document.title='발표 화면 — '+project.document.title;
if(speakerMode)document.title='발표자 보기 — '+project.document.title;
function fit(){const area=$('stage'),scale=Math.min(area.clientWidth/1600,area.clientHeight/900);$('slides').style.transform=`translate(-50%,-50%) scale(${scale})`;}
function status(){const slide=project.document.slides[current],view=views[current];$('page').textContent=`${current+1} / ${views.length}`;$('parent').disabled=!slide.parentId;$('evidence').disabled=!slide.evidenceIds?.length;$('notes-title').textContent=slide.title;$('notes-body').textContent=slide.notes;$('next-title').textContent=project.document.slides[current+1]?'다음: '+project.document.slides[current+1].title:'마지막 장표';$('pause').textContent=(speakerMode&&session?.connected?mirroredState:view.player.state)==='running'?'일시정지':'재생';$('previous').disabled=current===0&&(!view.stepCount||view.step<=1);$('next').disabled=current===views.length-1&&(!view.stepCount||view.step>=view.stepCount);}
function navigate(id,play=true){if(speakerMode&&!applying&&session?.sendNavigation(id))return;const index=project.document.slides.findIndex(s=>s.id===id);if(index<0)return;views[current].player.pause();current=index;views.forEach((s,i)=>s.root.classList.toggle('is-current',i===current));if(play)views[current].player.restart();else views[current].player.finish();const url=new URL(location.href);url.searchParams.set('slide',id);history.replaceState(null,'',url.href);status();fit();sync();}
function sync(){if(!applying)session?.publish();}
function command(name){if(speakerMode&&session?.sendCommand(name))return;const s=views[current];if(name==='next'){if(s.stepCount&&s.step<s.stepCount)s.goToStep(s.step+1);else if(current<views.length-1)navigate(project.document.slides[current+1].id);}if(name==='previous'){if(s.stepCount&&s.step>1)s.goToStep(s.step-1);else if(current>0)navigate(project.document.slides[current-1].id);}if(name==='replay')s.player.restart();if(name==='pause'){if(s.player.state==='running')s.player.pause();else if(s.player.state==='finished')s.player.restart();else s.player.play();}status();sync();}
for(const name of ['next','previous','replay','pause'])$(name).onclick=()=>command(name);
$('ai').onclick=()=>openOfflineAi(project,project.document.slides[current].id,pages);
$('parent').onclick=()=>navigate(project.document.slides.find(s=>s.id===project.document.slides[current].parentId)?.id);
function dialog(title){const node=document.createElement('dialog');node.className='offline-dialog';node.setAttribute('aria-label',title);guardPresentationDialog(node);const head=document.createElement('h2');head.textContent=title;const close=document.createElement('button');close.textContent='닫기';close.onclick=()=>node.close();node.append(close,head);document.body.append(node);node.addEventListener('close',()=>node.remove(),{once:true});return node;}
$('toc').onclick=()=>{const node=dialog('전체 장표');for(const slide of project.document.slides){const button=document.createElement('button');button.className='offline-toc-item';button.textContent=slide.title;button.onclick=()=>{navigate(slide.id);node.close();};node.append(button);}node.showModal();};
$('evidence').onclick=()=>{const node=dialog('관련 증거');for(const id of project.document.slides[current].evidenceIds??[]){const entry=project.evidence?.find(e=>e.id===id);if(entry)node.append(createEvidenceFigure(document,entry));}node.showModal();};
$('find').onclick=()=>openPresentationSearch(document,project,id=>navigate(id),new Map(views.map(v=>[v.root.id,v.metadata().content])));
function popupUrl(mode){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set(mode,'1');url.searchParams.set('slide',project.document.slides[current].id);if(mode==='speaker')url.searchParams.set('peerSession',ownerSession);else url.searchParams.set('presentationSession','audience-'+ownerSession);return url.href;}
function popupSize(speaker=false){return {slide:project.document.slides[current].id,width:speaker?Math.min(1400,Math.round(screen.availWidth)):Math.round(screen.availWidth),height:speaker?Math.min(850,Math.round(screen.availHeight)):Math.round(screen.availHeight),left:Math.round(screen.availLeft||0),top:Math.round(screen.availTop||0)};}
$('present').textContent=query.has('audience')?'조작 보기':'발표 시작';
$('present').onclick=async()=>{
 if(query.has('audience')){document.body.classList.toggle('offline-audience');$('present').textContent=document.body.classList.contains('offline-audience')?'조작 보기':'발표 화면';fit();return;}
 if(openingAudience)return;if(audienceWindow&&!audienceWindow.closed){try{audienceWindow.focus();return;}catch{audienceWindow=null;}}openingAudience=true;$('present').disabled=true;$('status').textContent='청중 창 준비 확인 중…';
 try{audienceWindow=await openPresentationPopup(window,popupUrl('audience'),popupSize(),12000,'audience-'+project.document.id+'-'+ownerSession);$('status').textContent='청중 창 준비 완료. 그 창에서 발표자 보기를 여세요.';}catch(error){$('status').textContent=error.message;}finally{openingAudience=false;$('present').disabled=false;}
};
$('speaker').onclick=async()=>{
 if(openingSpeaker)return;if(session?.peer&&!session.peer.closed){try{session.peer.focus();return;}catch{}}openingSpeaker=true;$('speaker').disabled=true;$('status').textContent='발표자 창 준비 확인 중…';
 try{const peer=await openPresentationPopup(window,popupUrl('speaker'),popupSize(true),12000,'speaker-'+project.document.id+'-'+ownerSession);session.attach(peer);$('status').textContent='발표자 창 준비 완료. 다른 화면으로 옮기세요.';}catch(error){$('status').textContent=error.message;}finally{openingSpeaker=false;$('speaker').disabled=false;}
};
session=createPresentationPeerSession({
 view:window,project:project.document.id,token:speakerMode?query.get('peerSession')||ownerSession:ownerSession,
 receiver:speakerMode,peer:speakerMode?window.opener:null,acceptReceiver:sender=>sender.opener===window,
 state:()=>({id:project.document.slides[current].id,time:views[current].player.currentTime,state:views[current].player.state}),
 apply:data=>{if(!project.document.slides.some(s=>s.id===data.id))return;applying=true;try{if(project.document.slides[current].id!==data.id)navigate(data.id,false);if(Math.abs(views[current].player.currentTime-data.time)>.1)views[current].player.seek(data.time);mirroredState=data.state;}finally{applying=false;}status();},
 command,navigate,
 onConnection:connected=>{if(speakerMode){if(!connected)mirroredState=undefined;$('status').textContent=connected?'청중 창과 연결되었습니다.':'청중 창이 닫혔습니다. 이 창에서 장표를 계속 볼 수 있습니다.';}else if(!connected)$('status').textContent='발표자 창이 닫혔습니다. 발표자 보기로 다시 열 수 있습니다.';status();}
});
const removeShortcuts=createPresentationShortcuts(document,{find:()=>$('find').click()});
window.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable]'))return;const name=presentationPlaybackCommand(event);if(name){event.preventDefault();command(name);}});
const toolbarLayout=createAdaptivePresentationToolbar(document.querySelector('.offline-toolbar'),{property:'--offline-toolbar-height',onResize:fit});
$('slides').addEventListener('presentationstepchange',status);
window.addEventListener('resize',fit);const observer=new ResizeObserver(fit);observer.observe($('stage'));applying=true;const initial=query.get('slide');navigate(project.document.slides.some(s=>s.id===initial)?initial:project.document.slides[0].id,!speakerMode);applying=false;notifyPresentationReady(window);const timer=setInterval(()=>{if(!speakerMode)status();},250);window.addEventListener('pagehide',()=>{clearInterval(timer);session.destroy();removeShortcuts();toolbarLayout.destroy();observer.disconnect();rendered.destroy();},{once:true});
