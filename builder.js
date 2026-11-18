import { presentationTheme, projectSections } from './template-theme.js';
import { getAuthoredPages } from './authored-pages.js';
import { createDocumentFromScenario, makeDocumentSlide, readPresentationPhotos, validatePresentationProject, validProjectId, firstContentSlide, assertPresentationContent, addPresentationDividers } from './vendor/foundation/presentation-document.js';
import { renderPresentationDocument } from './vendor/foundation/presentation-document-view.js';
import { openAppProjectStore } from './project-store.js';
import {validatePageData,presentationPath,inspectPresentationCopy} from './vendor/foundation/presentation-structure.js';
import {openPresentationSearch,createPresentationShortcuts} from './vendor/foundation/presentation-search.js';
import {validateMedia,youtubeVideoId} from './vendor/foundation/presentation-media.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let project,assets=[],selected=0,store,timer,saveQueue=Promise.resolve(),busy=false,previewView;
const message=text=>{$('status').textContent=text;};
function findProject(){if(!project){message('내용 초안을 만든 뒤 장표를 찾을 수 있습니다.');return;}openPresentationSearch(document,project,id=>{selected=project.document.slides.findIndex(s=>s.id===id);renderEditor();show('edit');preview().catch(e=>message(e.message));});}
$('find-project').onclick=findProject;
const removeShortcuts=createPresentationShortcuts(document,{find:()=>{if(!busy)findProject();},save:()=>{if(!busy&&project)$('save-json').click();}});
window.addEventListener('pagehide',removeShortcuts,{once:true});
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function setBusy(value){busy=value;document.querySelectorAll('.actions a').forEach(link=>link.setAttribute('aria-disabled',String(value)));document.body.setAttribute('aria-busy',String(value));document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=value);if(!value){$('save-json').disabled=!project;$('find-project').disabled=!project;$('export-authoring').disabled=!project;$('edit-tab').disabled=!project;}}
async function persist(){if(!project)return;const value=validatePresentationProject(project);saveQueue=saveQueue.catch(()=>{}).then(()=>store.save(value));await saveQueue;try{localStorage.setItem('presentation-last-project',value.document.id);}catch{} }
async function preview(){
 await persist();if(!project)return;
 const id=project.document.id,slide=project.document.slides[selected];
 $('view-deck').href=`./deck.html?project=${id}`;$('export-deck').href=`./export.html?project=${id}`;
 try{
  assertPresentationContent({...project.document,slides:[slide]});
  previewView?.destroy();
  previewView=renderPresentationDocument(project,$('preview'),presentationTheme,{slideId:slide.id,pageOffset:selected,totalSlides:project.document.slides.length,sections:projectSections(project.document),pages:getAuthoredPages(id),textMotion:false});
  previewView.slides[0].player.finish();
  $('preview-message').hidden=true;$('preview-frame').hidden=false;
 }catch(e){$('preview-frame').hidden=true;$('preview-message').hidden=false;$('preview-message').textContent=e.message;throw e;}
}
const previewResize=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;if(width)$('preview').style.transform=`scale(${width/1600})`;});previewResize.observe($('preview-frame'));
function queueSave(){clearTimeout(timer);timer=setTimeout(()=>{persist().then(()=>message('저장했습니다. 미리보기 갱신으로 배치를 확인할 수 있습니다.')).catch(e=>message(e.message));},500);}
function show(panel){$('input-panel').hidden=panel!=='input';$('edit-panel').hidden=panel!=='edit';$('input-tab').toggleAttribute('aria-current',panel==='input');$('edit-tab').toggleAttribute('aria-current',panel==='edit');if(panel==='input')$('input-tab').setAttribute('aria-current','step');else $('edit-tab').setAttribute('aria-current','step');}
function renderPhotos(){const list=$('photo-list');list.replaceChildren();assets.forEach(asset=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=asset.dataUrl;img.alt=asset.name;caption.textContent=asset.name;figure.append(img,caption);list.append(figure);});}
function renderExtraFields(){
 const doc=project.document,s=doc.slides[selected];for(const key of ['purpose','audience','decision'])$(key).value=doc[key]||'';
 $('slide-media-layout').value=s.mediaLayout||'auto';$('slide-message').value=s.message||'';$('slide-role').value=s.role||'main';$('slide-data').value=s.data?JSON.stringify(s.data,null,2):'';$('slide-evidence').value=(s.evidenceIds||[]).join(', ');$('slide-agenda').value=s.agendaMode||'divider';
 const parent=$('slide-parent');parent.replaceChildren(new Option('없음',''));doc.slides.filter(v=>!presentationPath(doc.slides,v.id).some(p=>p.id===s.id)).forEach(v=>parent.add(new Option(v.title,v.id)));parent.value=s.parentId||'';
 $('copy-warnings').textContent=inspectPresentationCopy([s]).map(v=>v.message).join(' ');
 const media=$('slide-media');media.replaceChildren();(project.media||[]).forEach(m=>media.add(new Option(`${m.title} · ${m.kind==='file'?'파일':'YouTube'}`,m.id,false,s.mediaIds?.includes(m.id))));$('add-youtube').disabled=['cover','section','closing'].includes(s.layout);
}
for(const key of ['purpose','audience','decision'])$(key).addEventListener('input',()=>{if(project){project.document[key]=$(key).value;queueSave();}});
for(const [field,key] of [['slide-media-layout','mediaLayout'],['slide-message','message'],['slide-role','role'],['slide-parent','parentId'],['slide-agenda','agendaMode']])$(field).addEventListener($(field).tagName==='SELECT'?'change':'input',()=>{if(!project)return;project.document.slides[selected][key]=$(field).value||undefined;queueSave();if(key==='mediaLayout')preview().then(()=>message('동영상 배치를 적용했습니다.')).catch(e=>message(e.message));});
$('slide-data').oninput=()=>{if(!project)return;try{const text=$('slide-data').value;project.document.slides[selected].data=text.trim()?validatePageData(JSON.parse(text)):undefined;queueSave();}catch(e){message(`본문 JSON을 확인해 주세요. 마지막 유효 데이터는 유지합니다. ${e.message}`);}};
$('slide-evidence').onchange=()=>{if(!project)return;const refs=$('slide-evidence').value.split(',').map(v=>v.trim()).filter(Boolean);try{const replacement=validatePresentationProject({...project,document:{...project.document,slides:project.document.slides.map((s,i)=>i===selected?{...s,evidenceIds:refs}:s)}});project=replacement;queueSave();}catch(e){message(e.message);}};
$('slide-media').onchange=()=>{if(!project)return;try{const refs=[...$('slide-media').selectedOptions].map(o=>o.value);const next=validatePresentationProject({...project,document:{...project.document,slides:project.document.slides.map((s,i)=>i===selected?{...s,mediaIds:refs}:s)}});project=next;queueSave();}catch(e){message(e.message);}};
$('add-youtube').onclick=async()=>{if(!project||busy)return;try{const entry=validateMedia([{id:'media-'+crypto.randomUUID(),title:project.document.slides[selected].title+' · 동영상',kind:'youtube',videoId:youtubeVideoId($('youtube-url').value.trim()),start:Number($('youtube-start').value),end:Number($('youtube-end').value),at:0,muted:true}])[0];const next=validatePresentationProject({...project,media:[...(project.media||[]),entry],document:{...project.document,slides:project.document.slides.map((s,i)=>i===selected?{...s,mediaIds:[...(s.mediaIds||[]),entry.id]}:s)}});project=next;renderEditor();await preview();message('YouTube 링크를 연결했습니다. 실제 영상은 불러오기를 누를 때 연결합니다.');}catch(e){message(e.message);}};
function renderOutline(){const list=$('outline');list.replaceChildren();project.document.slides.forEach((slide,index)=>{const button=document.createElement('button');button.textContent=`${String(index+1).padStart(2,'0')} ${slide.title}`;if(index===selected)button.setAttribute('aria-current','page');button.onclick=()=>{selected=index;renderEditor();preview().catch(e=>message(e.message));};list.append(button);});}
function fieldVisibility(){const s=project.document.slides[selected],bookend=['cover','section','closing'].includes(s.layout);$('items-field').hidden=bookend;$('design-field').hidden=bookend;$('layout-field').hidden=Boolean(s.authored);$('image-alt-field').hidden=!s.imageId;$('layout-help').textContent=bookend?'템플릿의 표지·간지·마지막 장입니다.':s.authored?'코드로 관리하는 페이지입니다. pages 폴더에서 본문을 제작·수정합니다.':'제작 전 기본 초안입니다. 내용과 요청을 정리한 뒤 제작용 ZIP을 내보내세요.';$('export-authoring').title=s.authored?'페이지 코드가 있는 프로젝트는 폴더 전체를 보관하세요.':'템플릿과 발표 자료를 제작용 ZIP으로 저장합니다.';}
function renderEditor(){const s=project.document.slides[selected];renderExtraFields();renderOutline();$('editor-heading').textContent=`${selected+1}번 장표`;$('slide-title').value=s.title;$('slide-section').value=s.section;$('slide-subtitle').value=s.subtitle;$('slide-layout').value=s.layout;$('slide-items').value=s.items.join('\n');$('slide-notes').value=s.notes;$('slide-alt').value=s.imageAlt;$('slide-design').value=s.design||'';
 const select=$('slide-image');select.replaceChildren(new Option('사진 없음',''));project.assets.forEach(asset=>select.add(new Option(asset.name,asset.id)));select.value=s.imageId||'';$('move-up').disabled=selected===0;$('move-down').disabled=selected===project.document.slides.length-1;$('remove-slide').disabled=project.document.slides.length===1;$('edit-tab').disabled=false;$('save-json').disabled=false;$('find-project').disabled=false;$('export-authoring').disabled=project.document.slides.some(s=>s.authored);fieldVisibility();}
for(const [id,key] of [['slide-title','title'],['slide-section','section'],['slide-subtitle','subtitle'],['slide-layout','layout'],['slide-items','items'],['slide-notes','notes'],['slide-alt','imageAlt'],['slide-image','imageId'],['slide-design','design']]){
 $(id).addEventListener(id==='slide-layout'||id==='slide-image'?'change':'input',()=>{if(!project)return;const s=project.document.slides[selected],value=$(id).value;s[key]=key==='items'?value.split('\n').filter(v=>v.trim()):key==='imageId'?value||undefined:value;renderOutline();fieldVisibility();queueSave();});
}
$('input-tab').onclick=()=>show('input');$('edit-tab').onclick=()=>{renderEditor();show('edit');};
$('photos').onchange=async()=>{try{setBusy(true);const replacement=await readPresentationPhotos([...$('photos').files]);assets=replacement;renderPhotos();message(`${assets.length}개 사진을 읽었습니다. 내용·스크립트 초안을 만들면 배치합니다.`);}catch(e){message(e.message);}finally{setBusy(false);}};
const example=`# 업무 지식을 질문과 답변으로 연결하기
## 구성 예제
### 세 영역의 역할
- 데이터 연결: DB·문서·API의 메타데이터와 설명을 연결합니다.
- 지식 구성: 관계·업무 용어·규칙을 함께 관리합니다.
- 실행·운영: 질문에 필요한 맥락을 전달하고 결과를 확인합니다.
### 정보가 답변으로 이어지는 순서
1. DB 메타데이터에서 테이블·컬럼·관계를 가져옵니다.
2. 업무 문서에서 용어·코드·규칙을 정리합니다.
3. API와 실행 이력에서 설명·질의·스킬을 연결합니다.
4. 수집한 정보를 시멘틱 컨텍스트에 편입합니다.
5. 질문에 맞는 맥락을 Select AI에 전달합니다.
6. 업무 용어와 규칙을 반영한 답변을 확인합니다.
## 적용 전후
### 관리 전후 비교
- 이전: DB·문서·API의 설명이 각각 분리되어 있습니다.
- 이후: 관계·용어·규칙을 시멘틱 컨텍스트에서 함께 관리합니다.`;
$('example').onclick=()=>{$('scenario').value=example;$('title').value='업무 지식을 질문과 답변으로 연결하기';message('예제 시나리오를 넣었습니다. 내용·스크립트 초안을 만들어 편집하세요.');};
async function generate(llm=false){
 if(busy)return;setBusy(true);message(llm?'목차와 발표 내용을 정리하고 있습니다…':'내용·스크립트 초안을 만들고 있습니다…');
 try{
  const scenario=$('scenario').value,id=crypto.randomUUID(),options={id,title:$('title').value,presenter:$('presenter').value};
  let document=createDocumentFromScenario(scenario,assets,options);
  if(llm){const response=await fetch('/api/presentation-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,title:document.title,context:Object.fromEntries(['purpose','audience','decision'].map(k=>[k,$(k).value])),images:assets.map(a=>({id:a.id,name:a.name}))})});const data=await response.json();if(!response.ok)throw Error(data.error||'구성을 생성하지 못했습니다.');document={...document,slides:[document.slides[0],...data.slides.map((s,i)=>({...makeDocumentSlide(`scene-${i+1}`,s.title,s.layout),section:s.section,subtitle:s.subtitle,items:s.items,notes:s.notes,message:s.message,imageId:s.imageId,imageAlt:assets.find(a=>a.id===s.imageId)?.name||''})),document.slides.at(-1)]};}
  document=addPresentationDividers({...document,brief:$('design-request').value,...Object.fromEntries(['purpose','audience','decision'].map(k=>[k,$(k).value]))});const replacement=validatePresentationProject({document,assets});assertPresentationContent(replacement.document);await store.save(replacement);project=replacement;selected=firstContentSlide(project.document);history.replaceState(null,'',`?project=${id}`);renderEditor();show('edit');await preview();message(`${document.slides.length}장 기본 초안을 저장했습니다. 내용·요청을 확인한 뒤 제작용 ZIP을 내보내세요.`);
 }catch(e){message(e.message);}finally{setBusy(false);if(project)renderEditor();}
}
$('generate').onclick=()=>generate();$('generate-llm').onclick=()=>generate(true);
$('add-slide').onclick=()=>{if(project.document.slides.length>=60)return message('장표는 최대 60장까지 만들 수 있습니다.');const slide=makeDocumentSlide(`scene-${crypto.randomUUID()}`,'새 장표');project.document.slides.splice(selected+1,0,slide);selected++;renderEditor();preview().catch(e=>message(e.message));};
$('remove-slide').onclick=()=>{if(project.document.slides.length<=1)return;const removed=project.document.slides[selected];project.document.slides.forEach(s=>{if(s.parentId===removed.id)s.parentId=removed.parentId;});project.document.slides.splice(selected,1);selected=Math.min(selected,project.document.slides.length-1);renderEditor();preview().catch(e=>message(e.message));};
for(const [id,delta] of [['move-up',-1],['move-down',1]])$(id).onclick=()=>{const target=selected+delta;if(target<0||target>=project.document.slides.length)return;const list=project.document.slides;[list[selected],list[target]]=[list[target],list[selected]];selected=target;renderEditor();preview().catch(e=>message(e.message));};
$('preview-slide').onclick=()=>preview().then(()=>message('미리보기를 갱신했습니다.')).catch(e=>message(e.message));
$('save-json').onclick=()=>{try{download(validatePresentationProject(project),'presentation-project.json');message('사진이 포함된 프로젝트 JSON을 저장했습니다.');}catch(e){message(e.message);}};
$('export-authoring').onclick=async()=>{
 if(busy||!project)return;clearTimeout(timer);setBusy(true);message('제작용 프로젝트를 묶고 있습니다…');
 try{
  project.document.brief=$('design-request').value;await persist();
  const response=await fetch('/api/authoring-bundle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validatePresentationProject(project))});
  if(!response.ok){const data=await response.json();throw Error(data.error||'제작용 ZIP을 만들지 못했습니다.');}
  const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='presentation-authoring.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  message('제작용 ZIP을 저장했습니다. 압축을 푼 폴더를 Codex·Claude에서 열고 REQUEST.md대로 제작을 요청하세요.');
 }catch(e){message(e.message);}finally{setBusy(false);renderEditor();}
};
for(const id of ['view-deck','export-deck'])$(id).onclick=async event=>{event.preventDefault();if(busy)return;try{assertPresentationContent(project.document);await persist();if(id==='view-deck')window.open($('view-deck').href,'_blank');else location.href=$('export-deck').href;}catch(e){message(e.message);}};
$('open-json').onclick=()=>$('project-file').click();$('project-file').onchange=async()=>{try{const file=$('project-file').files[0];if(!file)return;if(file.size>36*1024*1024)throw Error('프로젝트 JSON은 36MB 이내여야 합니다.');const replacement=validatePresentationProject(JSON.parse(await file.text()));assertPresentationContent(replacement.document);await store.save(replacement);project=replacement;assets=project.assets;selected=firstContentSlide(project.document);$('scenario').value=project.document.scenario;$('title').value=project.document.title;$('presenter').value=project.document.presenter;$('design-request').value=project.document.brief||'';renderPhotos();renderEditor();show('edit');history.replaceState(null,'',`?project=${project.document.id}`);await preview();message('프로젝트 JSON을 불러왔습니다.');}catch(e){message(e.message);}};
async function loadProject(id){const saved=await store.load(id);if(!saved)throw Error('저장된 프로젝트를 찾을 수 없습니다. JSON을 불러와 주세요.');project=saved;assets=saved.assets;selected=firstContentSlide(saved.document);$('scenario').value=saved.document.scenario;$('title').value=saved.document.title;$('presenter').value=saved.document.presenter;$('design-request').value=saved.document.brief||'';renderPhotos();renderEditor();show('edit');await preview();message('저장된 프로젝트를 불러왔습니다.');}
$('new-project').onclick=async()=>{try{await persist();clearTimeout(timer);project=undefined;assets=[];selected=0;$('scenario').value='';$('title').value='';$('presenter').value='';$('photos').value='';$('design-request').value='';for(const key of ['purpose','audience','decision'])$(key).value='';renderPhotos();$('save-json').disabled=true;$('find-project').disabled=true;$('export-authoring').disabled=true;$('edit-tab').disabled=true;show('input');history.replaceState(null,'',location.pathname);message('새 시나리오와 사진을 입력해 주세요.');}catch(e){message(e.message);}};
try{
 store=await openAppProjectStore();const id=query.get('project');
 if(id&&validProjectId(id))await loadProject(id);
 else {let last;try{last=localStorage.getItem('presentation-last-project');}catch{}if(last&&validProjectId(last)){$('resume-project').hidden=false;$('resume-project').onclick=()=>loadProject(last).catch(e=>message(e.message));}}
 const capabilities=await fetch('/api/export-capabilities').then(r=>r.json()).catch(()=>({}));$('llm-info').textContent=capabilities.llm?`${capabilities.model}`:'LLM 구성은 .env API 설정 후 사용';
}catch(e){message(e.message);$('generate').disabled=true;$('generate-llm').disabled=true;}
