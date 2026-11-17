import { presentationTheme, projectSections } from './template-theme.js';
import { createDocumentFromScenario, makeDocumentSlide, readPresentationPhotos, validatePresentationProject, validProjectId, firstContentSlide, assertPresentationContent, addPresentationDividers } from './vendor/foundation/presentation-document.js';
import { renderPresentationDocument } from './vendor/foundation/presentation-document-view.js';
import { openAppProjectStore } from './project-store.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let project,assets=[],selected=0,store,timer,saveQueue=Promise.resolve(),busy=false,previewView;
const message=text=>{$('status').textContent=text;};
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function setBusy(value){busy=value;document.querySelectorAll('.actions a').forEach(link=>link.setAttribute('aria-disabled',String(value)));document.body.setAttribute('aria-busy',String(value));document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=value);if(!value){$('save-json').disabled=!project;$('edit-tab').disabled=!project;}}
async function persist(){if(!project)return;const value=validatePresentationProject(project);saveQueue=saveQueue.catch(()=>{}).then(()=>store.save(value));await saveQueue;try{localStorage.setItem('presentation-last-project',value.document.id);}catch{} }
async function preview(){
 await persist();if(!project)return;
 const id=project.document.id,slide=project.document.slides[selected];
 $('view-deck').href=`./deck.html?project=${id}`;$('export-deck').href=`./export.html?project=${id}`;
 try{
  assertPresentationContent({...project.document,slides:[slide]});
  previewView?.destroy();
  previewView=renderPresentationDocument({document:{...project.document,slides:[slide]},assets:project.assets},$('preview'),presentationTheme,{pageOffset:selected,totalSlides:project.document.slides.length,sections:projectSections(project.document)});
  previewView.slides[0].player.finish();
  $('preview-message').hidden=true;$('preview-frame').hidden=false;
 }catch(e){$('preview-frame').hidden=true;$('preview-message').hidden=false;$('preview-message').textContent=e.message;throw e;}
}
const previewResize=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;if(width)$('preview').style.transform=`scale(${width/1600})`;});previewResize.observe($('preview-frame'));
function queueSave(){clearTimeout(timer);timer=setTimeout(()=>{persist().then(()=>message('저장했습니다. 미리보기 갱신으로 배치를 확인할 수 있습니다.')).catch(e=>message(e.message));},500);}
function show(panel){$('input-panel').hidden=panel!=='input';$('edit-panel').hidden=panel!=='edit';$('input-tab').toggleAttribute('aria-current',panel==='input');$('edit-tab').toggleAttribute('aria-current',panel==='edit');if(panel==='input')$('input-tab').setAttribute('aria-current','step');else $('edit-tab').setAttribute('aria-current','step');}
function renderPhotos(){const list=$('photo-list');list.replaceChildren();assets.forEach(asset=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=asset.dataUrl;img.alt=asset.name;caption.textContent=asset.name;figure.append(img,caption);list.append(figure);});}
function renderOutline(){const list=$('outline');list.replaceChildren();project.document.slides.forEach((slide,index)=>{const button=document.createElement('button');button.textContent=`${String(index+1).padStart(2,'0')} ${slide.title}`;if(index===selected)button.setAttribute('aria-current','page');button.onclick=()=>{selected=index;renderEditor();preview().catch(e=>message(e.message));};list.append(button);});}
function fieldVisibility(){const s=project.document.slides[selected],bookend=['cover','section','closing'].includes(s.layout);$('items-field').hidden=bookend;$('image-alt-field').hidden=!s.imageId;$('layout-help').textContent=bookend?'이 레이아웃은 제목과 부제를 표시합니다. 본문은 목록에서 본문 장표를 선택해 편집하세요.':'본문 항목과 사진을 화면에 표시합니다. 발표 스크립트는 자막과 발표자 보기에 사용합니다.';}
function renderEditor(){const s=project.document.slides[selected];renderOutline();$('editor-heading').textContent=`${selected+1}번 장표`;$('slide-title').value=s.title;$('slide-section').value=s.section;$('slide-subtitle').value=s.subtitle;$('slide-layout').value=s.layout;$('slide-items').value=s.items.join('\n');$('slide-notes').value=s.notes;$('slide-alt').value=s.imageAlt;
 const select=$('slide-image');select.replaceChildren(new Option('사진 없음',''));project.assets.forEach(asset=>select.add(new Option(asset.name,asset.id)));select.value=s.imageId||'';$('move-up').disabled=selected===0;$('move-down').disabled=selected===project.document.slides.length-1;$('remove-slide').disabled=project.document.slides.length===1;$('edit-tab').disabled=false;$('save-json').disabled=false;fieldVisibility();}
for(const [id,key] of [['slide-title','title'],['slide-section','section'],['slide-subtitle','subtitle'],['slide-layout','layout'],['slide-items','items'],['slide-notes','notes'],['slide-alt','imageAlt'],['slide-image','imageId']]){
 $(id).addEventListener(id==='slide-layout'||id==='slide-image'?'change':'input',()=>{if(!project)return;const s=project.document.slides[selected],value=$(id).value;s[key]=key==='items'?value.split('\n').filter(v=>v.trim()):key==='imageId'?value||undefined:value;renderOutline();fieldVisibility();queueSave();});
}
$('input-tab').onclick=()=>show('input');$('edit-tab').onclick=()=>{renderEditor();show('edit');};
$('photos').onchange=async()=>{try{setBusy(true);const replacement=await readPresentationPhotos([...$('photos').files]);assets=replacement;renderPhotos();message(`${assets.length}개 사진을 읽었습니다. 장표 생성을 누르면 배치합니다.`);}catch(e){message(e.message);}finally{setBusy(false);}};
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
$('example').onclick=()=>{$('scenario').value=example;$('title').value='업무 지식을 질문과 답변으로 연결하기';message('예제 시나리오를 넣었습니다. 사진을 추가하거나 장표 생성을 누르세요.');};
async function generate(llm=false){
 if(busy)return;setBusy(true);message(llm?'시나리오로 장표 구성을 만들고 있습니다…':'장표를 만들고 있습니다…');
 try{
  const scenario=$('scenario').value,id=crypto.randomUUID(),options={id,title:$('title').value,presenter:$('presenter').value};
  let document=createDocumentFromScenario(scenario,assets,options);
  if(llm){const response=await fetch('/api/presentation-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,title:document.title,images:assets.map(a=>({id:a.id,name:a.name}))})});const data=await response.json();if(!response.ok)throw Error(data.error||'구성을 생성하지 못했습니다.');document={...document,slides:[document.slides[0],...data.slides.map((s,i)=>({...makeDocumentSlide(`scene-${i+1}`,s.title,s.layout),section:s.section,subtitle:s.subtitle,items:s.items,notes:s.notes,imageId:s.imageId,imageAlt:assets.find(a=>a.id===s.imageId)?.name||''})),document.slides.at(-1)]};}
  document=addPresentationDividers(document);const replacement=validatePresentationProject({document,assets});assertPresentationContent(replacement.document);await store.save(replacement);project=replacement;selected=firstContentSlide(project.document);history.replaceState(null,'',`?project=${id}`);renderEditor();show('edit');await preview();message(`${document.slides.length}장 생성·저장했습니다. 목록에서 장표를 선택해 수정하세요.`);
 }catch(e){message(e.message);}finally{setBusy(false);if(project)renderEditor();}
}
$('generate').onclick=()=>generate();$('generate-llm').onclick=()=>generate(true);
$('add-slide').onclick=()=>{if(project.document.slides.length>=60)return message('장표는 최대 60장까지 만들 수 있습니다.');const slide=makeDocumentSlide(`scene-${crypto.randomUUID()}`,'새 장표');project.document.slides.splice(selected+1,0,slide);selected++;renderEditor();preview().catch(e=>message(e.message));};
$('remove-slide').onclick=()=>{if(project.document.slides.length<=1)return;project.document.slides.splice(selected,1);selected=Math.min(selected,project.document.slides.length-1);renderEditor();preview().catch(e=>message(e.message));};
for(const [id,delta] of [['move-up',-1],['move-down',1]])$(id).onclick=()=>{const target=selected+delta;if(target<0||target>=project.document.slides.length)return;const list=project.document.slides;[list[selected],list[target]]=[list[target],list[selected]];selected=target;renderEditor();preview().catch(e=>message(e.message));};
$('preview-slide').onclick=()=>preview().then(()=>message('미리보기를 갱신했습니다.')).catch(e=>message(e.message));
$('save-json').onclick=()=>{try{download(validatePresentationProject(project),'presentation-project.json');message('사진이 포함된 프로젝트 JSON을 저장했습니다.');}catch(e){message(e.message);}};
for(const id of ['view-deck','export-deck'])$(id).onclick=async event=>{event.preventDefault();if(busy)return;try{assertPresentationContent(project.document);await persist();if(id==='view-deck')window.open($('view-deck').href,'_blank');else location.href=$('export-deck').href;}catch(e){message(e.message);}};
$('open-json').onclick=()=>$('project-file').click();$('project-file').onchange=async()=>{try{const file=$('project-file').files[0];if(!file)return;if(file.size>36*1024*1024)throw Error('프로젝트 JSON은 36MB 이내여야 합니다.');const replacement=validatePresentationProject(JSON.parse(await file.text()));assertPresentationContent(replacement.document);await store.save(replacement);project=replacement;assets=project.assets;selected=firstContentSlide(project.document);$('scenario').value=project.document.scenario;$('title').value=project.document.title;$('presenter').value=project.document.presenter;renderPhotos();renderEditor();show('edit');history.replaceState(null,'',`?project=${project.document.id}`);await preview();message('프로젝트 JSON을 불러왔습니다.');}catch(e){message(e.message);}};
async function loadProject(id){const saved=await store.load(id);if(!saved)throw Error('저장된 프로젝트를 찾을 수 없습니다. JSON을 불러와 주세요.');project=saved;assets=saved.assets;selected=firstContentSlide(saved.document);$('scenario').value=saved.document.scenario;$('title').value=saved.document.title;$('presenter').value=saved.document.presenter;renderPhotos();renderEditor();show('edit');await preview();message('저장된 프로젝트를 불러왔습니다.');}
$('new-project').onclick=async()=>{try{await persist();clearTimeout(timer);project=undefined;assets=[];selected=0;$('scenario').value='';$('title').value='';$('presenter').value='';$('photos').value='';renderPhotos();$('save-json').disabled=true;$('edit-tab').disabled=true;show('input');history.replaceState(null,'',location.pathname);message('새 시나리오와 사진을 입력해 주세요.');}catch(e){message(e.message);}};
try{
 store=await openAppProjectStore();const id=query.get('project');
 if(id&&validProjectId(id))await loadProject(id);
 else {let last;try{last=localStorage.getItem('presentation-last-project');}catch{}if(last&&validProjectId(last)){$('resume-project').hidden=false;$('resume-project').onclick=()=>loadProject(last).catch(e=>message(e.message));}}
 const capabilities=await fetch('/api/export-capabilities').then(r=>r.json()).catch(()=>({}));$('llm-info').textContent=capabilities.llm?`${capabilities.model}`:'LLM 구성은 .env API 설정 후 사용';
}catch(e){message(e.message);$('generate').disabled=true;$('generate-llm').disabled=true;}
