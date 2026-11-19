import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPresentationHash,writePresentationHash} from '../app/presentation-launch.js';
import {openBrowserPresentation,openPresentationPopup,notifyPresentationReady,createPresentationMirror,createPresentationPeerSession} from '../vendor/foundation/presentation-window.js';
import {createPresentationShortcuts,searchPresentation,presentationPlaybackCommand} from '../vendor/foundation/presentation-search.js';
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
test('playback keys leave reload, print, history and composing input to the browser',()=>{
 const base={ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,defaultPrevented:false,isComposing:false};
 for(const [key,command] of [['ArrowRight','next'],[' ','next'],['ArrowLeft','previous'],['p','pause'],['r','replay']])assert.equal(presentationPlaybackCommand({...base,key}),command);
 for(const event of [{key:'r',metaKey:true},{key:'r',ctrlKey:true},{key:'p',metaKey:true},{key:'ArrowLeft',altKey:true},{key:' ',shiftKey:true},{key:'r',isComposing:true},{key:'r',defaultPrevented:true}])assert.equal(presentationPlaybackCommand({...base,...event}),undefined);
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

test('checked file popup returns the actual child only after its readiness acknowledgement',async()=>{
 const f=fake();f.view.location={href:'file:///tmp/Redwood%20demo/index.html',origin:'null'};
 const promise=openPresentationPopup(f.view,'?speaker=1&slide=scene',request);
 const data={type:'presentation-ready',token:f.url.searchParams.get('presentationLaunch')};
 f.listeners.get('message')({origin:'null',source:{},data});
 assert.equal(f.listeners.has('message'),true);
 f.listeners.get('message')({origin:'null',source:f.child,data});
 assert.equal(await promise,f.child);assert.equal(f.url.protocol,'file:');
 assert.equal(f.url.pathname,'/tmp/Redwood%20demo/index.html');assert.equal(f.url.searchParams.get('slide'),'scene');
});

test('popup closure before readiness fails and opaque origins cannot open a different protocol',async()=>{
 const f=fake();let check;f.view.setInterval=fn=>{check=fn;return 2;};
 const promise=openPresentationPopup(f.view,'/index.html',request);f.child.closed=true;check();
 await assert.rejects(promise,/닫혔습니다/);assert.equal(f.listeners.has('message'),false);
 const file=fake();file.view.location={href:'file:///tmp/deck/index.html',origin:'null'};
 assert.throws(()=>openPresentationPopup(file.view,'data:text/html,other',request),/같은 출처/);
});

test('file and HTTP mirrors exchange state with the expected peer and retain a safe target origin',()=>{
 for(const [href,target] of [['file:///tmp/deck/index.html','*'],['http://127.0.0.1:4173/index.html','http://127.0.0.1:4173']]){
  const f=fake(),sent=[],applied=[],commands=[];f.view.location={href,origin:href.startsWith('file:')?'file://':target};
  f.child.postMessage=(data,origin)=>sent.push({data,origin});
  const receiver=createPresentationMirror({view:f.view,project:'demo',peer:f.child,acceptReceiver:()=>false,state:()=>({id:'cover',time:0}),apply:s=>applied.push(s),command:()=>{}});
  assert.equal(sent[0].origin,target);assert.equal(sent[0].data.type,'presentation-receiver');
  const state={type:'presentation-clock',project:'demo',id:'scene',time:1250},receive=f.listeners.get('message'),origin=new URL(href).origin;
  receive({origin,source:{},data:state});receive({origin:'https://other.test',source:f.child,data:state});receive({origin,source:f.child,data:{...state,time:NaN}});
  assert.equal(applied.length,0);receive({origin,source:f.child,data:state});assert.deepEqual(applied,[{id:'scene',time:1250}]);
  assert.equal(receiver.sendCommand('next'),true);assert.equal(sent.at(-1).origin,target);f.child.closed=true;assert.equal(receiver.sendCommand('next'),false);receiver.destroy();
  f.child.closed=false;let publish;f.view.setInterval=fn=>{publish=fn;return 2;};
  const audience=createPresentationMirror({view:f.view,project:'demo',acceptReceiver:sender=>sender===f.child,state:()=>({id:'scene',time:2500}),apply:()=>{},command:name=>commands.push(name)}),handle=f.listeners.get('message');
  handle({origin,source:f.child,data:{type:'presentation-receiver',project:'demo'}});publish();assert.equal(sent.at(-1).origin,target);assert.equal(sent.at(-1).data.time,2500);
  handle({origin,source:{},data:{type:'presentation-command',project:'demo',name:'next'}});handle({origin,source:f.child,data:{type:'presentation-command',project:'demo',name:'next'}});assert.deepEqual(commands,['next']);audience.destroy();
 }
});

function peerPair(file=false){
 const queue=[],origin=file?'null':'http://127.0.0.1:4173';
 function view(){const listeners=new Map(),timers=new Set();return {location:{href:file?'file:///tmp/deck/index.html':origin+'/index.html'},listeners,timers,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),setInterval(fn){timers.add(fn);return fn;},clearInterval(fn){timers.delete(fn);}};}
 const audience=view(),speaker=view();
 const toAudience={closed:false,postMessage(data,target){assert.equal(target,file?'*':origin);queue.push(()=>audience.listeners.get('message')?.({origin,source:toSpeaker,data}));}};
 const toSpeaker={closed:false,opener:audience,postMessage(data,target){assert.equal(target,file?'*':origin);queue.push(()=>speaker.listeners.get('message')?.({origin,source:toAudience,data}));}};
 function flush(){let count=0;while(queue.length){assert.ok(count++<100,'message loop');queue.shift()();}}
 return {audience,speaker,toAudience,toSpeaker,origin,flush,tick(view){for(const fn of view.timers)fn();flush();}};
}
test('peer sessions reconnect after either window reloads and preserve audience state',()=>{
 for(const file of [false,true]){
  const b=peerPair(file),applied=[],commands=[],navigation=[];let position={id:'scene',time:4300,state:'paused'};
  const ownerOptions={view:b.audience,project:'demo',token:'owner-session',receiver:false,acceptReceiver:sender=>sender===b.toSpeaker,state:()=>position,apply(){},command:name=>commands.push(name),navigate:id=>navigation.push(id)};
  const receiverOptions={view:b.speaker,project:'demo',token:'owner-session',receiver:true,peer:b.toAudience,acceptReceiver:()=>false,state:()=>({id:'cover',time:0,state:'idle'}),apply:s=>applied.push(s),command(){},navigate(){}};
  let owner=createPresentationPeerSession(ownerOptions),receiver=createPresentationPeerSession(receiverOptions);b.flush();
  assert.equal(owner.connected,true);assert.equal(receiver.connected,true);assert.deepEqual(applied.at(-1),position);
  receiver.sendCommand('next');receiver.sendNavigation('closing');b.flush();assert.deepEqual(commands,['next']);assert.deepEqual(navigation,['closing']);
  owner.destroy();position={id:'closing',time:2000,state:'finished'};owner=createPresentationPeerSession(ownerOptions);b.tick(b.speaker);
  assert.equal(owner.peer,b.toSpeaker);assert.deepEqual(applied.at(-1),position);
  receiver.destroy();receiver=createPresentationPeerSession(receiverOptions);b.flush();assert.deepEqual(applied.at(-1),position);
  const before=applied.length;owner.destroy();receiver.destroy();b.tick(b.audience);b.tick(b.speaker);assert.equal(applied.length,before);assert.equal(b.audience.timers.size,0);assert.equal(b.speaker.timers.size,0);
 }
});
test('peer session rejects a different session or sender and reports closed peers once',()=>{
 const b=peerPair(),connections=[],applied=[];
 const owner=createPresentationPeerSession({view:b.audience,project:'demo',token:'secret-session',receiver:false,acceptReceiver:sender=>sender===b.toSpeaker,state:()=>({id:'scene',time:1000,state:'paused'}),apply(){},command(){},navigate(){},onConnection:value=>connections.push(value)});
 const handle=b.audience.listeners.get('message');
 handle({origin:b.origin,source:{},data:{type:'presentation-peer-ready',project:'demo',session:'secret-session'}});
 handle({origin:b.origin,source:b.toSpeaker,data:{type:'presentation-peer-ready',project:'demo',session:'wrong-session'}});assert.equal(owner.peer,null);
 const receiver=createPresentationPeerSession({view:b.speaker,project:'demo',token:'secret-session',receiver:true,peer:b.toAudience,acceptReceiver:()=>false,state:()=>({id:'cover',time:0,state:'idle'}),apply:s=>applied.push(s),command(){},navigate(){}});b.flush();assert.deepEqual(connections,[true]);
 const receive=b.speaker.listeners.get('message'),data={type:'presentation-peer-state',project:'demo',session:'secret-session',id:'scene',time:1000,state:'paused'},before=applied.length;
 for(const change of [{time:NaN},{time:-1},{state:'unknown'},{id:'../other'}])receive({origin:b.origin,source:b.toAudience,data:{...data,...change}});
 receive({origin:b.origin,source:{},data});assert.equal(applied.length,before);
 b.toSpeaker.closed=true;b.tick(b.audience);b.tick(b.audience);assert.deepEqual(connections,[true,false]);
 b.toAudience.closed=true;assert.equal(receiver.sendCommand('next'),false);assert.equal(receiver.connected,false);owner.destroy();receiver.destroy();
});

test('checked popups accept a stable window name without reusing their readiness token',async()=>{
 const f=fake(),names=[];const original=f.view.open;f.view.open=(url,name)=>{names.push(name);return original(url);};
 const tokens=[];
 for(let i=0;i<2;i++){
  const promise=openPresentationPopup(f.view,'/index.html',request,12000,'stable-audience');
  const token=f.url.searchParams.get('presentationLaunch');tokens.push(token);
  f.listeners.get('message')({origin:f.view.location.origin,source:f.child,data:{type:'presentation-ready',token}});await promise;
 }
 assert.deepEqual(names,['stable-audience','stable-audience']);assert.notEqual(tokens[0],tokens[1]);
});

test('toolbar reserves its measured height after wrapping and restores layout on cleanup',async()=>{
 const {createAdaptivePresentationToolbar}=await import('../vendor/foundation/presentation-layout.js');const properties=new Map();let resize,height=64,updates=0,disconnected=false;
 const view={ResizeObserver:class{constructor(callback){resize=callback;}observe(){}disconnect(){disconnected=true;}},addEventListener(){},removeEventListener(){}};
 const toolbar={ownerDocument:{defaultView:view,documentElement:{style:{getPropertyValue:k=>properties.get(k)||'',setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}}},getBoundingClientRect:()=>({height})};
 const controller=createAdaptivePresentationToolbar(toolbar,{onResize:()=>updates++});assert.equal(properties.get('--rf-presentation-toolbar-height'),'64px');height=104;resize();assert.equal(properties.get('--rf-presentation-toolbar-height'),'104px');resize();assert.equal(updates,2);controller.destroy();assert.equal(disconnected,true);assert.equal(properties.size,0);
});

test('slide hashes preserve the application path and project query with a document base',()=>{
 for(const href of ['http://127.0.0.1:4176/app/deck.html?project=example#/cover','file:///tmp/deck/examples/animations/samples.html#/cover']){
  let written;const view={location:{href},history:{replaceState:(_state,_title,url)=>written=url}};
  assert.equal(readPresentationHash(view),'cover');writePresentationHash('knowledge-flow',view);
  const before=new URL(href),after=new URL(written);assert.equal(after.pathname,before.pathname);assert.equal(after.search,before.search);assert.equal(after.hash,'#/knowledge-flow');
 }
 assert.equal(readPresentationHash({location:{href:'http://localhost/#/%E0%A4%A'}}),'');
});
