import {createAppAiConnection} from './ai-connection.js';
import {createAiPresentationPage} from '../vendor/foundation/presentation-ai-page.js';
import {renderPresentationDocument} from '../vendor/foundation/presentation-document-view.js';
import {presentationTheme,projectSections} from './template-theme.js';
import {guardPresentationDialog} from '../vendor/foundation/presentation-evidence.js';
import {capturePresentationPowerPointSlide} from '../vendor/foundation/presentation-powerpoint.js';

let imageLibrary;
function loadImageLibrary(){return imageLibrary??=new Promise((resolve,reject)=>{if(window.htmlToImage)return resolve(window.htmlToImage);const script=document.createElement('script');script.src='./vendor/html-to-image/html-to-image.js';script.onload=()=>resolve(window.htmlToImage);script.onerror=()=>{imageLibrary=undefined;script.remove();reject(Error('화면 캡처 도구를 읽지 못했습니다.'));};document.head.append(script);});}

async function api(path,body){let response;try{response=await fetch('/api/ai/'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'});}catch{throw Object.assign(Error('AI 서버에 연결하지 못했거나 응답을 받지 못했습니다. 연결을 확인해 주세요.'),{network:true});}const value=await response.json().catch(()=>({error:'AI 서버 응답을 읽지 못했습니다. 연결을 확인해 주세요.'}));if(!response.ok||value.error)throw Object.assign(Error(value.error||'AI 편집 요청에 실패했습니다.'),{status:response.status});return value;}
export async function loadPresentationAiPages(project){
 const id=project.document.id;let pages={};
 const response=await fetch(`/api/ai/projects/${id}/state`,{cache:'no-store'});
 if(response.ok)pages=(await response.json()).snapshot?.pages??{};
 // Portable releases can also be served without the Python API.
 if(!Object.keys(pages).length){const portable=await fetch('./presentation-ai-pages.json',{cache:'no-store'});if(portable.ok){const value=await portable.json();if(value.projectId===id)pages=value.pages;}}
 return new Map(Object.entries(pages).map(([key,page])=>[key,createAiPresentationPage(page)]));
}
export function openPresentationAiEditor({project,slideId,pages,onApplied,captureSnapshot}){
 let state,proposal,reviewed=false,busy=false,closed=false,writing=false,lastRequest='';const cleanups=[];
 const doc=document,id=project.document.id,path=`projects/${id}/`,panel=doc.createElement('dialog');panel.className='ai-editor';panel.setAttribute('aria-label','AI 장표 편집');guardPresentationDialog(panel,{canClose:()=>!writing,onBlocked:()=>message('저장 결과를 확인하는 중입니다. 잠시 기다려 주세요.')});
 const make=(tag,text='',className='')=>{const n=doc.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
 const close=make('button','닫기'),heading=make('h2','AI 편집'),target=make('p',project.document.slides.find(s=>s.id===slideId).title,'ai-target');close.className='ai-close';close.onclick=()=>{if(!writing)panel.close();};panel.append(close,heading,target);
 const status=make('p','연결 상태 확인 중…','ai-status');status.setAttribute('role','status');
 let connectionControl=createAppAiConnection(),connection=connectionControl.root;connection.open=true;panel.append(connection);
 const messages=make('div','','ai-messages');messages.setAttribute('aria-label','편집 대화');
 const promptLabel=make('label','변경 요청'),prompt=make('textarea');prompt.rows=4;prompt.maxLength=4000;prompt.placeholder='예: 표를 좌우 비교 도식으로 바꾸고, 설명을 두 줄로 줄여 주세요.';promptLabel.append(prompt);
 const generate=make('button','편집안 만들기'),review=make('button','변경 미리보기'),apply=make('button','적용'),cancelProposal=make('button','편집안 취소'),reload=make('button','최신 버전 불러오기'),proposalActions=make('div','','ai-actions');review.disabled=apply.disabled=cancelProposal.disabled=true;reload.hidden=true;proposalActions.append(review,cancelProposal,apply);panel.append(reload);panel.append(messages,promptLabel,generate,proposalActions,status);
 const archive=make('button','프로젝트 ZIP 저장');archive.onclick=async()=>{try{const response=await fetch('/api/ai/'+path+'archive');if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=make('a');link.href=url;link.download='presentation-ai-workspace.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){message(e.message);}};panel.append(archive);
 const history=make('details'),historyList=make('div','','ai-history');history.append(make('summary','변경 이력'),historyList);panel.append(history);doc.body.append(panel);panel.showModal();
 panel.addEventListener('close',()=>{closed=true;discardProposal();cleanups.forEach(f=>f());panel.remove();},{once:true});
 function message(text){status.textContent=text;}
 function setBusy(value){busy=value;generate.disabled=value||!state;prompt.disabled=value;apply.disabled=value||!proposal||!reviewed;review.disabled=value||!proposal;cancelProposal.disabled=writing||!proposal;reload.disabled=value;close.disabled=writing;connectionControl.setDisabled(value);for(const button of historyList.querySelectorAll('button'))button.disabled=value||!state||button.dataset.current==='true';}
 function discardProposal(){const old=proposal;proposal=undefined;reviewed=false;if(old)void api(path+'discard',{token:old.token}).catch(()=>{});}
 function invalidate(error){discardProposal();state=undefined;reload.hidden=false;if(!prompt.value.trim())prompt.value=lastRequest;message((error.status===409?'자료가 변경되어 작업을 중단했습니다.':writing&&error.network?'저장 응답을 받지 못해 적용 여부를 확인할 수 없습니다.':error.message)+' 최신 버전을 불러온 뒤 다시 요청해 주세요.');}
 cancelProposal.onclick=()=>{if(writing||!proposal)return;discardProposal();if(!prompt.value.trim())prompt.value=lastRequest;setBusy(busy);message('편집안을 취소했습니다. 원본은 변경하지 않았습니다.');};
 function settings(){return connectionControl.value();}
 async function capture(snapshot){
  if(captureSnapshot)return captureSnapshot(snapshot);
  const library=await loadImageLibrary(),mount=make('div','','ai-thumbnail-mount');doc.body.append(mount);let rendered;
  try{const factories=new Map(pages);for(const [key,page] of Object.entries(snapshot.pages))factories.set(key,createAiPresentationPage(page));rendered=renderPresentationDocument(snapshot.project,mount,presentationTheme,{pages:factories,slideId,pageOffset:snapshot.project.document.slides.findIndex(s=>s.id===slideId),textMotion:false,sections:projectSections(snapshot.project.document)});rendered.slides.forEach(s=>s.player.finish());return await capturePresentationPowerPointSlide(rendered.slides[0].root,(node,options)=>library.toPng(node,{...options,pixelRatio:0.8}));}finally{rendered?.destroy();mount.remove();}
 }
 const thumbnailPath=revision=>path+'thumbnail/'+revision+'/'+encodeURIComponent(slideId);
 async function remember(revision,snapshot,image){
  try{if(!image){const existing=await fetch('/api/ai/'+thumbnailPath(revision));if(existing.ok)return true;image=await capture(snapshot);}await api(thumbnailPath(revision),{image});return true;}catch{return false;}
 }
 function renderCompare(before,after,title){
  const dialog=make('dialog','','ai-compare');dialog.setAttribute('aria-label',title);guardPresentationDialog(dialog);const exit=make('button','닫기');exit.className='ai-close';exit.onclick=()=>dialog.close();dialog.append(exit,make('h2',title));
  const grid=make('div','','ai-compare-grid'),views=[];
  for(const [label,snapshot] of [['변경 전',before],['변경 후',after]]){
   const column=make('section'),viewport=make('div','','ai-slide-viewport'),mount=make('div','','ai-slide-mount');column.append(make('h3',label),viewport);viewport.append(mount);grid.append(column);
   const slide=snapshot.project.document.slides.find(s=>s.id===slideId);
   if(slide){const factories=new Map(pages);for(const [key,page] of Object.entries(snapshot.pages))factories.set(key,createAiPresentationPage(page));const rendered=renderPresentationDocument(snapshot.project,mount,presentationTheme,{pages:factories,slideId,pageOffset:snapshot.project.document.slides.findIndex(s=>s.id===slideId),textMotion:false,sections:projectSections(snapshot.project.document)});rendered.slides.forEach(s=>s.player.finish());views.push(rendered);
    column.append(make('pre',JSON.stringify({title:slide.title,subtitle:slide.subtitle,message:slide.message,items:slide.items,notes:slide.notes,data:slide.data},null,2),'ai-diff'));
   }else viewport.append(make('p','이 버전에는 선택한 장표가 없습니다.'));
  }
  dialog.append(grid);doc.body.append(dialog);dialog.showModal();const observer=new ResizeObserver(()=>{for(const viewport of grid.querySelectorAll('.ai-slide-viewport')){const scale=viewport.clientWidth/1600;viewport.style.height=`${900*scale}px`;viewport.firstElementChild.style.transform=`scale(${scale})`;}});grid.querySelectorAll('.ai-slide-viewport').forEach(n=>observer.observe(n));
  dialog.addEventListener('close',()=>{observer.disconnect();views.forEach(v=>v.destroy());dialog.remove();},{once:true});cleanups.push(()=>{if(dialog.isConnected)dialog.close();});
 }
 async function refreshHistory(){const value=await api(path+'history');if(state&&value.head!==state.head){invalidate(Error('자료의 기준 버전이 바뀌었습니다.'));}historyList.replaceChildren();for(const version of value.versions){const row=make('article'),date=new Date(version.time*1000).toLocaleString(),compare=make('button','비교'),restore=make('button','복원'),image=make('img'),preview=make('button','','ai-history-preview');image.alt='저장된 장표 화면';image.src='/api/ai/'+thumbnailPath(version.revision);image.loading='lazy';preview.append(image);preview.setAttribute('aria-label',version.summary+' 저장 화면 확대');image.onerror=()=>{preview.replaceChildren(make('span','저장된 화면 없음'));preview.disabled=true;preview.dataset.current='true';};preview.onclick=()=>{const dialog=make('dialog','','ai-capture-view');guardPresentationDialog(dialog);const exit=make('button','닫기'),full=make('img');full.src=image.src;full.alt=version.summary;exit.onclick=()=>dialog.close();dialog.append(exit,make('h2','저장 당시 화면'),full);doc.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});cleanups.push(()=>{if(dialog.isConnected)dialog.close();});};row.append(preview,make('p',version.summary),make('small',`${date} · ${version.revision.slice(0,7)}`));if(version.request)row.append(make('p',version.request,'ai-request'));compare.onclick=async()=>{setBusy(true);try{const old=await api(path+'version/'+version.revision);if(closed||!state)return;renderCompare(old.snapshot,state.snapshot,'원본 데이터 비교 · 현재 렌더러');}catch(e){message(e.message);}finally{setBusy(false);}};restore.disabled=version.revision===value.head;restore.dataset.current=String(restore.disabled);restore.onclick=async()=>{if(busy||closed||!state)return;writing=true;setBusy(true);try{await api(path+'restore',{base:state.head,revision:version.revision});if(!closed)onApplied();}catch(e){if(!closed)invalidate(e);}finally{writing=false;if(!closed)setBusy(false);}};row.append(compare,restore);historyList.append(row);}}
 generate.onclick=async()=>{
  if(busy||closed||!state)return;discardProposal();setBusy(true);message('AI 편집안을 만드는 중…');const request=prompt.value;lastRequest=request;
  try{const result=await api(path+'propose',{slideId,request,base:state.head,connection:settings()});if(closed){void api(path+'discard',{token:result.token}).catch(()=>{});return;}if(result.base!==state.head)throw Error('편집안의 기준 버전이 다릅니다.');proposal=result;messages.append(make('p',request,'ai-user'),make('p',result.summary,'ai-assistant'));message('편집안이 준비됐습니다. 변경 미리보기에서 확인한 뒤 적용하세요.');connection.open=false;prompt.value='';}
  catch(e){if(!closed){if(e.status===409)invalidate(e);else message(e.message);}}finally{if(!closed)setBusy(false);}
 };
 review.onclick=()=>{if(busy||closed||!proposal||!state)return;try{renderCompare(state.snapshot,proposal.snapshot,'AI 편집안 비교');reviewed=true;setBusy(false);}catch(e){message(e.message);reviewed=false;setBusy(false);}};
 apply.onclick=async()=>{
  if(busy||closed||!proposal||!reviewed||!state)return;const candidate=proposal;setBusy(true);message('적용할 장표 화면을 준비하는 중…');
  try{let image;try{image=await capture(candidate.snapshot);}catch{}if(closed||proposal!==candidate||!reviewed)return;
   writing=true;setBusy(true);message('변경 사항을 저장하는 중…');const result=await api(path+'apply',{token:candidate.token});proposal=undefined;reviewed=false;if(image)await remember(result.revision,candidate.snapshot,image);if(!closed)onApplied();
  }catch(e){if(!closed)invalidate(e);}finally{writing=false;if(!closed)setBusy(false);}
 };
 async function initialize(reconnect=false){
  if(busy||closed)return;discardProposal();state=undefined;setBusy(true);reload.hidden=true;message('현재 자료를 불러오는 중…');
  try{
   if(reconnect){const previous=connection;connectionControl=createAppAiConnection();connection=connectionControl.root;connection.open=true;previous.replaceWith(connection);connectionControl.setDisabled(true);}
   await connectionControl.ready;if(closed)return;const current=await api(path+'state');if(closed)return;state=current.snapshot?current:await api(path+'init',{project:reconnect&&current.sourceProject?current.sourceProject:project});if(closed)return;if(!state.snapshot||!state.head)throw Error('AI 편집 서버의 자료를 확인하지 못했습니다.');target.textContent=state.snapshot.project.document.slides.find(s=>s.id===slideId)?.title||'장표가 삭제되었습니다.';if(!state.snapshot.project.document.slides.some(s=>s.id===slideId))throw Error('선택한 장표가 삭제됐습니다. 발표 화면을 새로고침해 주세요.');
   message('현재 장표 화면을 보관하고 있습니다…');const captured=await remember(state.head,state.snapshot);if(closed)return;message(captured?'변경 요청을 입력해 주세요.':'원본은 저장됐지만 화면 캡처에 실패했습니다. 변경 요청은 계속할 수 있습니다.');await refreshHistory();if(closed)return;
  }catch(e){if(!closed){state=undefined;reload.hidden=false;message(e.message);}}finally{if(!closed){setBusy(false);if(state)prompt.focus();}}
 }
 reload.onclick=()=>initialize(true);void initialize();
 return panel;
}
