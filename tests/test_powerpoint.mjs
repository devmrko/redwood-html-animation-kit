import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPresentationPowerPoint} from '../vendor/foundation/presentation-powerpoint.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=';
function factory(){const context=vm.createContext({console,setTimeout,clearTimeout,Blob,Buffer,TextEncoder,TextDecoder});context.global=context;vm.runInContext(readFileSync(new URL('../vendor/pptxgenjs/pptxgen.bundle.js',import.meta.url),'utf8'),context);return ()=>new context.PptxGenJS();}
test('PPTX preserves selected order, wide layout, PNG content and Korean notes',async()=>{
 const order=[];const blob=await createPresentationPowerPoint({slides:[{id:'second',title:'둘째',notes:'발표 노트 <원문> & 보존'},{id:'first',title:'첫째',notes:'다음 줄\n설명'}],createWriter:factory(),render:async id=>{order.push(id);return png;}});
 assert.deepEqual(order,['second','first']);const folder=mkdtempSync(join(tmpdir(),'redwood-pptx-'));
 try{const path=join(folder,'test.pptx');writeFileSync(path,Buffer.from(await blob.arrayBuffer()));
 execFileSync('python3',['-c',`import zipfile,sys,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
 p=E.fromstring(z.read('ppt/presentation.xml'));assert len(p.find('p:sldIdLst',ns))==2
 size=p.find('p:sldSz',ns);assert abs(int(size.attrib['cx'])/int(size.attrib['cy'])-16/9)<.001
 for name in z.namelist():
  if name.endswith('.xml') or name.endswith('.rels'):E.fromstring(z.read(name))
 notes=''.join(E.fromstring(z.read('ppt/notesSlides/notesSlide1.xml')).itertext());assert '발표 노트 <원문> & 보존' in notes
 assert any(n.startswith('ppt/media/') and n.endswith('.png') for n in z.namelist())
`,path]);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('empty, cancelled or failed capture does not produce a downloadable PPTX',async()=>{
 const createWriter=factory();await assert.rejects(createPresentationPowerPoint({slides:[],createWriter,render:async()=>png}));
 const controller=new AbortController();controller.abort();await assert.rejects(createPresentationPowerPoint({slides:[{id:'one',title:'한 장',notes:''}],createWriter,render:async()=>png,signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(createPresentationPowerPoint({slides:[{id:'one',title:'한 장',notes:''}],createWriter,render:async()=>{throw Error('image failed');}}),/image failed/);
});

test('mixed Korean and Latin text retains the HTML font policy in native PPT runs',async()=>{
 const {presentationFontFamilies,presentationFontRuns}=await import('../vendor/foundation/presentation-typography.js');
 const fonts=presentationFontFamilies('"Oracle Sans Tab","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif','MacIntel'),runs=presentationFontRuns('Oracle MCP 비교 30%',fonts);
 assert.equal(runs.map(r=>r.text).join(''),'Oracle MCP 비교 30%');assert.equal(runs[0].options.fontFace,'Oracle Sans Tab');assert.equal(runs.find(r=>r.text.includes('비교')).options.fontFace,'Apple SD Gothic Neo');
 assert.equal(presentationFontFamilies('"Oracle Sans Tab","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif','Win32').eastAsian,'Malgun Gothic');
 const blob=await createPresentationPowerPoint({slides:[{id:'native',title:'Font and table',notes:'보존'}],createWriter:factory(),render:async()=>({image:png,objects:[{kind:'text',text:runs,options:{x:1,y:1,w:8,h:1,fontFace:fonts.latin,fontSize:24,bold:true,margin:0}},{kind:'table',rows:[[{text:presentationFontRuns('기준',fonts)},{text:'Result'}],[{text:'API'},{text:'Success'}]],options:{x:1,y:3,w:8,h:2,colW:[4,4],rowH:[1,1],fontFace:fonts.latin,fontSize:18,autoPage:false}},{kind:'shape',shape:'rect',options:{x:10,y:2,w:1,h:1,fill:{color:'04536F'}}}]})});
 const folder=mkdtempSync(join(tmpdir(),'redwood-pptx-font-'));try{const path=join(folder,'native.pptx');writeFileSync(path,Buffer.from(await blob.arrayBuffer()));execFileSync('python3',['-c',`import zipfile,sys,xml.etree.ElementTree as E
with zipfile.ZipFile(sys.argv[1]) as z:
 ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
 root=E.fromstring(z.read('ppt/slides/slide1.xml'));fonts=[el.attrib['typeface'] for el in root.findall('.//a:latin',ns)]
 assert 'Oracle Sans Tab' in fonts and 'Apple SD Gothic Neo' in fonts
 assert len(root.findall('.//a:tbl',ns))==1
 assert len(root.findall('.//a:tr',ns))==2
 assert any(el.attrib.get('prst')=='rect' for el in root.findall('.//a:prstGeom',ns))
`,path]);}finally{rmSync(folder,{recursive:true,force:true});}
});

test('still-frame capture decodes a paused video without starting playback',async()=>{
 const {preparePresentationPowerPointSlide}=await import('../vendor/foundation/presentation-powerpoint.js');
 const handlers=new Map();let time=0,paused=false;
 const video={readyState:1,preload:'metadata',addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),get currentTime(){return time;},set currentTime(v){time=v;queueMicrotask(()=>{video.readyState=2;handlers.get('seeked')?.();});},pause(){paused=true;},play(){throw Error('must not play');}};
 const root={ownerDocument:{fonts:{ready:Promise.resolve()},defaultView:{setTimeout,clearTimeout}},querySelectorAll:n=>n==='video'?[video]:[],getBoundingClientRect:()=>({})};
 await preparePresentationPowerPointSlide(root);assert.equal(video.preload,'auto');assert.ok(time>0);assert.equal(paused,true);assert.equal(handlers.size,0);
});
