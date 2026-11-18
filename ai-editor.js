import {createAiPresentationPage} from './vendor/foundation/presentation-ai-page.js';
import {renderPresentationDocument} from './vendor/foundation/presentation-document-view.js';
import {presentationTheme,projectSections} from './template-theme.js';
import {guardPresentationDialog} from './vendor/foundation/presentation-evidence.js';

async function api(path,body){const response=await fetch('/api/ai/'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'AI 편집 요청에 실패했습니다.');return value;}
export async function loadPresentationAiPages(project){
 const id=project.document.id;let pages={};
 const response=await fetch(`/api/ai/projects/${id}/state`,{cache:'no-store'});
 if(response.ok)pages=(await response.json()).snapshot?.pages??{};
 // Portable releases can also be served without the Python API.
 if(!Object.keys(pages).length){const portable=await fetch('./presentation-ai-pages.json',{cache:'no-store'});if(portable.ok){const value=await portable.json();if(value.projectId===id)pages=value.pages;}}
 return new Map(Object.entries(pages).map(([key,page])=>[key,createAiPresentationPage(page)]));
}
export function openPresentationAiEditor({project,slideId,pages,onApplied}){
 const rememberedKey='presentation-ai-connection-v1';let remembered={};try{remembered=JSON.parse(localStorage.getItem(rememberedKey)||'{}');}catch{}
 const doc=document,id=project.document.id,path=`projects/${id}/`,panel=doc.createElement('dialog');panel.className='ai-editor';panel.setAttribute('aria-label','AI 장표 편집');guardPresentationDialog(panel);
 const make=(tag,text='',className='')=>{const n=doc.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
 const close=make('button','닫기'),heading=make('h2','AI 편집'),target=make('p',project.document.slides.find(s=>s.id===slideId).title,'ai-target');close.className='ai-close';close.onclick=()=>panel.close();panel.append(close,heading,target);
 const status=make('p','연결 상태 확인 중…','ai-status');status.setAttribute('role','status');
 const select=(label,entries)=>{const field=make('label',label),input=make('select');for(const [value,text] of entries){const option=make('option',text);option.value=value;input.append(option);}field.append(input);return {field,input};};
 const input=(label,value='')=>{const field=make('label',label),control=make('input');control.value=value;field.append(control);return {field,input:control};};
 const connection=make('details');connection.open=true;connection.append(make('summary','AI 연결'));
 const provider=select('연결 방식',[['openai','OpenAI 호환 API'],['oci','OCI CLI'],['cli','설치된 Codex·Claude']]),model=input('모델 (비우면 기본값)'),tool=select('프로그램',[]),profile=select('OCI 프로파일',[]),region=input('OCI 리전'),compartment=input('컴파트먼트 OCID'),format=select('OCI 모델 API',[['GENERIC','Generic'],['COHERE','Cohere']]);
 const ociFields=make('div','','ai-fields');ociFields.append(profile.field,region.field,compartment.field,format.field);const toolFields=make('div');toolFields.append(tool.field);connection.append(provider.field,toolFields,ociFields,model.field);panel.append(connection);
 const messages=make('div','','ai-messages');messages.setAttribute('aria-label','편집 대화');
 const promptLabel=make('label','변경 요청'),prompt=make('textarea');prompt.rows=4;prompt.maxLength=4000;prompt.placeholder='예: 표를 좌우 비교 도식으로 바꾸고, 설명을 두 줄로 줄여 주세요.';promptLabel.append(prompt);
 const generate=make('button','편집안 만들기'),review=make('button','변경 미리보기'),apply=make('button','적용'),proposalActions=make('div','','ai-actions');review.disabled=apply.disabled=true;proposalActions.append(review,apply);panel.append(messages,promptLabel,generate,proposalActions,status);
 const archive=make('button','프로젝트 ZIP 저장');archive.onclick=async()=>{try{const response=await fetch('/api/ai/'+path+'archive');if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=make('a');link.href=url;link.download='presentation-ai-workspace.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){message(e.message);}};panel.append(archive);
 const history=make('details'),historyList=make('div','','ai-history');history.append(make('summary','변경 이력'),historyList);panel.append(history);doc.body.append(panel);panel.showModal();
 let caps,state,proposal,reviewed=false,busy=false,closed=false;const cleanups=[];
 panel.addEventListener('close',()=>{closed=true;cleanups.forEach(f=>f());panel.remove();},{once:true});
 function message(text){status.textContent=text;}
 function setBusy(value){busy=value;generate.disabled=value;apply.disabled=value||!proposal||!reviewed;review.disabled=value||!proposal;for(const control of connection.querySelectorAll('select,input'))control.disabled=value;for(const button of historyList.querySelectorAll('button'))button.disabled=value||button.dataset.current==='true';}
 function updateProvider(){if(!caps)return;const which=provider.input.value;ociFields.hidden=which!=='oci';toolFields.hidden=which!=='cli';model.input.value=which==='openai'?caps.openai.model:which==='oci'?caps.oci.model:'';const available=caps[which].available;message(available?which==='cli'?'설치 감지됨 · 실행 시 로그인·모델 권한을 확인합니다.':which==='oci'?'프로파일 감지됨 · 리전·모델·컴파트먼트를 확인하세요.':'서버의 .env 설정을 사용합니다.':'설정이 없습니다. .env 또는 CLI 설치·로그인을 확인하세요.');}
 provider.input.onchange=updateProvider;profile.input.onchange=()=>{region.input.value=caps.oci.regions[profile.input.value]||caps.oci.region;};
 function settings(){return {provider:provider.input.value,model:model.input.value,tool:tool.input.value,profile:profile.input.value,region:region.input.value,compartment:compartment.input.value,apiFormat:format.input.value};}
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
 async function refreshHistory(){const value=await api(path+'history');state.head=value.head;historyList.replaceChildren();for(const version of value.versions){const row=make('article'),date=new Date(version.time*1000).toLocaleString(),compare=make('button','비교'),restore=make('button','복원');row.append(make('p',version.summary),make('small',`${date} · ${version.revision.slice(0,7)}`));if(version.request)row.append(make('p',version.request,'ai-request'));compare.onclick=async()=>{setBusy(true);try{const old=await api(path+'version/'+version.revision);renderCompare(old.snapshot,state.snapshot,'이전 버전 ↔ 현재');}catch(e){message(e.message);}finally{setBusy(false);}};restore.disabled=version.revision===value.head;restore.dataset.current=String(restore.disabled);restore.onclick=async()=>{setBusy(true);try{await api(path+'restore',{base:state.head,revision:version.revision});onApplied();}catch(e){message(e.message);setBusy(false);}};row.append(compare,restore);historyList.append(row);}}
 generate.onclick=async()=>{if(busy||!state)return;setBusy(true);proposal=undefined;reviewed=false;message('AI 편집안을 만드는 중…');const request=prompt.value;try{try{localStorage.setItem(rememberedKey,JSON.stringify(settings()));}catch{}const result=await api(path+'propose',{slideId,request,base:state.head,connection:settings()});if(closed)return;proposal=result;messages.append(make('p',request,'ai-user'),make('p',result.summary,'ai-assistant'));message('편집안이 준비됐습니다. 변경 미리보기에서 확인한 뒤 적용하세요.');connection.open=false;prompt.value='';}catch(e){message(e.message);}finally{if(!closed)setBusy(false);}};
 review.onclick=()=>{try{renderCompare(state.snapshot,proposal.snapshot,'AI 편집안 비교');reviewed=true;apply.disabled=false;}catch(e){message(e.message);apply.disabled=true;}};
 apply.onclick=async()=>{setBusy(true);try{await api(path+'apply',{token:proposal.token});onApplied();}catch(e){message(e.message);setBusy(false);}};
 setBusy(true);(async()=>{try{caps=await api('capabilities');if(closed)return;state=await api(path+'init',{project});if(closed)return;for(const name of caps.cli.tools){const option=make('option',name);option.value=name;tool.input.append(option);}for(const name of caps.oci.profiles){const option=make('option',name);option.value=name;profile.input.append(option);}profile.input.value=caps.oci.profile;region.input.value=caps.oci.region||caps.oci.regions[profile.input.value]||'';compartment.input.value=caps.oci.compartment;provider.input.value=caps.openai.available?'openai':caps.oci.available?'oci':'cli';updateProvider();if(['openai','oci','cli'].includes(remembered.provider)){provider.input.value=remembered.provider;updateProvider();for(const [key,control] of Object.entries({model,tool,profile,region,compartment,apiFormat:format}))if(typeof remembered[key]==='string')control.input.value=remembered[key];}await refreshHistory();setBusy(false);prompt.focus();}catch(e){if(!closed)message(e.message);}})();
 return panel;
}
