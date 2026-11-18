import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openBrowserPresentation,notifyPresentationReady} from '../vendor/foundation/presentation-window.js';
import {createPresentationShortcuts,searchPresentation} from '../vendor/foundation/presentation-search.js';
import {guardPresentationDialog} from '../vendor/foundation/presentation-evidence.js';
const request={slide:'scene',width:1600,height:900,left:0,top:0};
function fake(){const listeners=new Map(),timers=[],child={closed:false};let url;
 const view={location:{href:'http://127.0.0.1:4173/deck.html',origin:'http://127.0.0.1:4173'},crypto,
 addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),open:value=>{url=new URL(value);return child;},setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},setInterval:()=>2,clearInterval(){}};
 return {view,child,listeners,timers,get url(){return url;}};
}
test('popup resolves only for the expected same-origin child readiness token',async()=>{
 const f=fake();let opened=false;const result=openBrowserPresentation(f.view,'/deck.html',request).then(()=>opened=true);
 const data={type:'presentation-ready',token:f.url.searchParams.get('presentationLaunch')},handler=f.listeners.get('message');
 handler({origin:'https://example.test',source:f.child,data});handler({origin:f.view.location.origin,source:{},data});handler({origin:f.view.location.origin,source:f.child,data:{...data,token:'wrong'}});
 await Promise.resolve();assert.equal(opened,false);
 handler({origin:f.view.location.origin,source:f.child,data});await result;assert.equal(opened,true);assert.equal(f.listeners.has('message'),false);
});
test('blocked, failed and timed-out popup attempts do not report success',async()=>{
 const blocked=fake();blocked.view.open=()=>null;await assert.rejects(openBrowserPresentation(blocked.view,'/deck.html',request),/팝업이 차단/);
 const failed=fake(),promise=openBrowserPresentation(failed.view,'/deck.html',request);
 failed.listeners.get('message')({origin:failed.view.location.origin,source:failed.child,data:{type:'presentation-ready',token:failed.url.searchParams.get('presentationLaunch'),error:'missing module'}});
 await assert.rejects(promise,/missing module/);
 const slow=fake(),timeout=openBrowserPresentation(slow.view,'/deck.html',request);slow.timers[0]();await assert.rejects(timeout,/준비를 확인/);
});
test('search covers hidden slides, scripts, page data and rendered text',()=>{
 const project={document:{slides:[{id:'a',title:'표 비교',message:'같은 기준',items:['입력'],notes:'발표자만 보는 설명',data:{cell:'계정 제한'}},{id:'b',title:'배포',items:[],notes:'저장'}]}};
 assert.deepEqual(searchPresentation(project,'계정 설명').map(s=>s.id),['a']);assert.equal(searchPresentation(project,'').length,0);
 assert.equal(searchPresentation(project,'실제 SVG',new Map([['b','실제 SVG 표시 내용']]))[0].id,'b');
});
test('Ctrl/Cmd+F and Ctrl/Cmd+S invoke local actions and remove listeners',()=>{
 let handler,find=0,save=0,prevented=0;const doc={addEventListener:(_,fn)=>handler=fn,removeEventListener:()=>handler=undefined};
 const dispose=createPresentationShortcuts(doc,{find:()=>find++,save:()=>save++});
 for(const event of [{key:'f',ctrlKey:true},{key:'s',metaKey:true}])handler({...event,preventDefault:()=>prevented++,stopImmediatePropagation(){}});
 assert.equal(find,1);assert.equal(save,1);assert.equal(prevented,2);dispose();assert.equal(handler,undefined);
});
test('modal Escape closes only the dialog before global deck keyboard handling',()=>{
 let capture,closed=0,prevented=false,stopped=false,closeListener;
 const doc={addEventListener:(name,fn,phase)=>{if(phase)capture=fn;},removeEventListener(){},querySelectorAll:()=>[dialog]};
 const dialog={ownerDocument:doc,open:true,close:()=>{closed++;closeListener();},addEventListener:(name,fn)=>{if(name==='close')closeListener=fn;}};
 guardPresentationDialog(dialog);capture({key:'Escape',preventDefault:()=>prevented=true,stopImmediatePropagation:()=>stopped=true});
 assert.equal(closed,1);assert.ok(prevented&&stopped);
});

test('file popup readiness uses an opaque-origin target while HTTP keeps its origin',()=>{
 for(const [href,origin,target] of [['file:///tmp/deck/index.html?presentationLaunch=token','null','*'],['http://127.0.0.1:4173/deck.html?presentationLaunch=token','http://127.0.0.1:4173','http://127.0.0.1:4173']]){
  const sent=[];notifyPresentationReady({location:{href,origin},opener:{postMessage:(...args)=>sent.push(args)}});assert.equal(sent[0][1],target);assert.equal(sent[0][0].token,'token');
 }
});

test('toolbar reserves its measured height after wrapping and restores layout on cleanup',async()=>{
 const {createAdaptivePresentationToolbar}=await import('../vendor/foundation/presentation-layout.js');const properties=new Map();let resize,height=64,updates=0,disconnected=false;
 const view={ResizeObserver:class{constructor(callback){resize=callback;}observe(){}disconnect(){disconnected=true;}},addEventListener(){},removeEventListener(){}};
 const toolbar={ownerDocument:{defaultView:view,documentElement:{style:{getPropertyValue:k=>properties.get(k)||'',setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}}},getBoundingClientRect:()=>({height})};
 const controller=createAdaptivePresentationToolbar(toolbar,{onResize:()=>updates++});assert.equal(properties.get('--rf-presentation-toolbar-height'),'64px');height=104;resize();assert.equal(properties.get('--rf-presentation-toolbar-height'),'104px');resize();assert.equal(updates,2);controller.destroy();assert.equal(disconnected,true);assert.equal(properties.size,0);
});
