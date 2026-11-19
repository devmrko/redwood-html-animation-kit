import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDocumentFromScenario,validatePresentationDocument,validatePresentationProject,firstContentSlide,assertPresentationContent} from '../vendor/foundation/presentation-document.js';
import {createPresentationExportPlan,createSubtitleDraft,serializeSrt} from '../vendor/foundation/presentation-subtitles.js';
import {validatePageData,validateEvidence,presentationPath,inspectPresentationCopy} from '../vendor/foundation/presentation-structure.js';
const id='11111111-1111-4111-8111-111111111111';
const photo={id:'photo-1',name:'표지.jpeg',type:'image/jpeg',dataUrl:`data:image/jpeg;base64,${readFileSync(new URL('../assets/redwood-cover.jpeg',import.meta.url)).toString('base64')}`};
const scenario='# 새 발표\n## 처리 순서\n1. 자료를 입력합니다.\n2. 검토합니다.\n3. 결과를 저장합니다.\n## 이전과 이후 비교\n- 이전 방식\n- 이후 방식';

test('scenario and photos produce an editable JSON document with steps and comparison',()=>{
 const document=createDocumentFromScenario(scenario,[photo],{id});
 const project=validatePresentationProject(JSON.parse(JSON.stringify({document,assets:[photo]})));
 assert.equal(project.document.title,'새 발표');
 assert.equal(project.document.slides[0].layout,'cover');
 assert.equal(project.document.slides.at(-1).layout,'closing');
 const steps=project.document.slides.find(s=>s.layout==='steps');
 assert.equal(steps.items.length,3);assert.equal(steps.imageId,photo.id);assert.match(steps.notes,/결과/);
 assert.ok(project.document.slides.some(s=>s.layout==='comparison'));
});
test('extra photos are included and JSON changes alter the next render data',()=>{
 const photos=Array.from({length:3},(_,i)=>({...photo,id:`photo-${i}`}));
 const document=createDocumentFromScenario('첫 장표 내용',photos,{id});
 assert.equal(document.slides.filter(s=>s.imageId).length,3);
 document.slides[1].title='JSON에서 바꾼 제목';
 assert.equal(validatePresentationDocument(document).slides[1].title,'JSON에서 바꾼 제목');
});
test('project rejects external image sources, SVG disguises, missing references and duplicate slide IDs',()=>{
 const document=createDocumentFromScenario(scenario,[photo],{id});
 for(const asset of [{...photo,dataUrl:'https://example.com/photo.jpg'},{...photo,type:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zz4='},{...photo,dataUrl:'data:image/jpeg;base64,PHN2Zz4='}])assert.throws(()=>validatePresentationProject({document,assets:[asset]}));
 assert.throws(()=>validatePresentationProject({document,assets:[]}));
 document.slides[1].id=document.slides[0].id;assert.throws(()=>validatePresentationDocument(document));
});
test('example JSON and generated document feed the common subtitle/export contract',()=>{
 const {document}=validatePresentationProject(JSON.parse(readFileSync(new URL('../examples/presentation-project.json',import.meta.url))));
 const plan=createPresentationExportPlan(document.slides.map(s=>({id:s.id,title:s.title,notes:s.notes,duration:10,captions:createSubtitleDraft(s.notes,10),included:true})));
 assert.equal(plan.slides.length,document.slides.length);assert.match(serializeSrt(plan.captions),/시나리오와 사진/);
});
test('long scenarios split content and retain the original scenario',()=>{
 const scenario='## 설명\n'+Array.from({length:15},(_,i)=>`- 항목 ${i+1}`).join('\n');
 const document=createDocumentFromScenario(scenario,[],{id});
 assert.equal(document.scenario,scenario);assert.ok(document.slides.every(s=>s.items.length<=6));
 assert.equal(document.slides.flatMap(s=>s.items).length,15);
});
test('title-only scenarios fail instead of producing an empty body page',()=>{
 for(const value of ['# 제목','# 제목\n## 섹션\n### 하위 제목'])assert.throws(()=>createDocumentFromScenario(value,[],{id}),/본문이 없습니다/);
});
test('LLM null image references normalize to no photo and the initial selection has content',()=>{
 const document=createDocumentFromScenario(scenario,[],{id});
 document.slides.forEach(s=>s.imageId=null);
 const normalized=validatePresentationDocument(document);
 assert.ok(normalized.slides.every(s=>s.imageId===undefined));
 const selected=normalized.slides[firstContentSlide(normalized)];
 assert.equal(selected.layout,'steps');assert.ok(selected.items.length>0);assertPresentationContent(normalized);
});
test('empty model body is rejected before preview or presentation',()=>{
 const document=createDocumentFromScenario(scenario,[],{id});
 document.slides.find(slide=>slide.layout==='steps').items=[];
 assert.throws(()=>assertPresentationContent(document),/본문이 없습니다/);
});
test('introductory prose is retained and a chapter divider does not consume the first photo',()=>{
 const input='# 발표\n## 섹션\n### 처리 순서\n전체 흐름을 설명합니다.\n1. 등록\n2. 확인';
 const document=createDocumentFromScenario(input,[photo],{id,presenter:'발표자'});
 const divider=document.slides.find(s=>s.layout==='section');
 const body=document.slides.find(s=>s.layout==='steps');
 assert.equal(divider.imageId,undefined);assert.equal(body.imageId,photo.id);
 assert.equal(body.subtitle,'전체 흐름을 설명합니다.');assert.notEqual(document.slides[0].subtitle,'발표자');
});
test('generated decks insert the template agenda before each section of body content',()=>{
 const document=createDocumentFromScenario('# 발표\n## 등록\n자료를 입력합니다.\n## 확인\n입력 내용을 확인합니다.',[],{id});
 assert.deepEqual(document.slides.map(s=>s.layout),['cover','section','content','section','content','closing']);
 assert.deepEqual(document.slides.filter(s=>s.layout==='section').map(s=>s.title),['등록','확인']);
 assert.equal(firstContentSlide(document),2);
});
test('agent-authored pages keep code separate while metadata survives JSON round trips',()=>{
 const document=createDocumentFromScenario(scenario,[],{id});
 document.brief='표와 SVG로 제작';const slide=document.slides.find(s=>s.layout==='steps');
 slide.authored=true;slide.design='가로 도식과 순차 강조';slide.items=[];
 const result=validatePresentationProject(JSON.parse(JSON.stringify({document,assets:[]})));
 assert.equal(result.document.brief,document.brief);assert.equal(result.document.slides.find(s=>s.id===slide.id).design,slide.design);assertPresentationContent(result.document);
 slide.authored='https://example.test/code.js';assert.throws(()=>validatePresentationDocument(document));
});
test('structured page data, audience brief and parent roles survive normalization',()=>{
 const document=createDocumentFromScenario(scenario,[],{id});const bodies=document.slides.filter(s=>s.items.length);document.purpose='처리 순서 설명';document.audience='담당자';document.decision='공통 양식 사용';
 bodies[1].parentId=bodies[0].id;bodies[1].role='detail';bodies[1].message='검토 후 보관';bodies[1].data={columns:['이전','이후'],rows:[['문서','양식']]};
 const parsed=validatePresentationDocument(JSON.parse(JSON.stringify(document)));
 assert.equal(parsed.decision,document.decision);assert.deepEqual(parsed.slides.find(s=>s.id===bodies[1].id).data,bodies[1].data);assert.equal(presentationPath(parsed.slides,bodies[1].id).length,2);
 bodies[0].parentId=bodies[1].id;assert.throws(()=>validatePresentationDocument(document),/순환/);
});
test('unsafe or missing evidence references fail while 31 file assets are supported',()=>{
 const entries=Array.from({length:31},(_,i)=>({id:`e-${i}`,title:`증거 ${i}`,path:`evidence/e-${i}.png`,type:'image/png',bytes:100,sha256:'a'.repeat(64),kind:'mock',claim:'합성 예제',source:'테스트'}));
 assert.equal(validateEvidence(entries).length,31);
 for(const path of ['../secret.png','evidence/../private.png','evidence/%2e%2e/private.png','https://example.test/x.png'])assert.throws(()=>validateEvidence([{...entries[0],path}]));
 const document=createDocumentFromScenario(scenario,[],{id});document.slides[1].evidenceIds=['missing'];assert.throws(()=>validatePresentationProject({document,assets:[],evidence:entries}),/증거/);
 assert.throws(()=>validatePageData(JSON.parse('{"__proto__":{}}')));assert.throws(()=>validatePageData({n:Infinity}));
 assert.ok(inspectPresentationCopy([{id:'a',title:'설명',layout:'content',items:['카드를 선택하세요']}]).length>=2);
});

test('document appearance and per-slide overrides survive JSON and reject unknown themes',()=>{
 const document=createDocumentFromScenario(scenario,[],{id});document.appearance='dark';document.slides[0].appearance='light';
 const result=validatePresentationDocument(JSON.parse(JSON.stringify(document)));
 assert.equal(result.appearance,'dark');assert.equal(result.slides[0].appearance,'light');assert.equal(result.slides[1].appearance,undefined);
 document.appearance='sepia';assert.throws(()=>validatePresentationDocument(document));document.appearance='light';document.slides[1].appearance='sepia';assert.throws(()=>validatePresentationDocument(document));
});


test('an incomplete OCI profile does not hide a usable local CLI default',async()=>{
 const {defaultPresentationAiProvider}=await import('../vendor/foundation/presentation-ai-connection.js');
 const caps={openai:{available:false,model:''},oci:{available:true,profiles:['DEFAULT'],regions:{DEFAULT:'us-chicago-1'},profile:'DEFAULT',region:'',model:'',compartment:''},cli:{available:true,tools:['codex']}};
 assert.equal(defaultPresentationAiProvider(caps),'cli');
 caps.oci.model='configured';caps.oci.compartment='configured';assert.equal(defaultPresentationAiProvider(caps),'oci');
 caps.openai.available=true;assert.equal(defaultPresentationAiProvider(caps),'openai');
 caps.openai.available=false;caps.oci.available=false;caps.cli.available=false;assert.equal(defaultPresentationAiProvider(caps),'openai');
});
