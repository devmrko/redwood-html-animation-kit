export interface PresentationWindowRequest { slide: string; width: number; height: number; left: number; top: number; project?: string }

/** Open synchronously from a user gesture; resolve only when this child is ready. */
export function openBrowserPresentation(view:Window,url:string,request:PresentationWindowRequest,timeout=12000):Promise<void>{
 const target=new URL(url,view.location.href);if(target.origin!==view.location.origin)throw Error('같은 출처의 발표 화면만 열 수 있습니다.');
 const token=view.crypto.randomUUID();target.searchParams.set('presentationLaunch',token);
 return new Promise((resolve,reject)=>{
  let child:Window|null=null,timer:number|undefined,poll:number|undefined,done=false;
  function end(error?:Error){if(done)return;done=true;view.removeEventListener('message',receive);view.clearTimeout(timer);view.clearInterval(poll);error?reject(error):resolve();}
  function receive(event:MessageEvent){if(event.origin!==target.origin||event.source!==child||event.data?.type!=='presentation-ready'||event.data.token!==token)return;end(event.data.error?new Error('발표 화면 준비 실패: '+String(event.data.error).slice(0,300)):undefined);}
  view.addEventListener('message',receive);
  try{child=view.open(target.href,`presentation-${token}`,`popup=yes,width=${request.width},height=${request.height},left=${request.left},top=${request.top}`);}catch(error){end(error instanceof Error?error:new Error(String(error)));return;}
  if(!child){end(new Error('팝업이 차단됐습니다. 이 사이트의 팝업을 허용한 뒤 발표 시작을 다시 누르세요.'));return;}
  timer=view.setTimeout(()=>end(new Error('청중 창의 준비를 확인하지 못했습니다. 새 창의 오류를 확인하고 다시 시도해 주세요.')),timeout);
  poll=view.setInterval(()=>{if(child?.closed)end(new Error('발표 준비 전에 청중 창이 닫혔습니다.'));},200);
 });
}
export function notifyPresentationReady(view:Window,error?:string):void{
 const token=new URL(view.location.href).searchParams.get('presentationLaunch');
 if(token&&view.opener)view.opener.postMessage({type:'presentation-ready',token,error},view.location.origin);
}

/** A notes preview forwards commands to its audience, and mirrors that clock. */
export function createPresentationMirror(options:{view:Window;project:string;peer?:Window;acceptReceiver:(sender:Window)=>boolean;state:()=>{id:string;time:number};apply:(state:{id:string;time:number})=>void;command:(name:'next'|'previous'|'pause'|'replay')=>void}):{sendCommand(name:'next'|'previous'|'pause'|'replay'):boolean;destroy():void}{
 const {view,peer,project}=options,receivers=new Set<Window>(),origin=view.location.origin;
 function receive(event:MessageEvent){
  const data=event.data;if(event.origin!==origin||!data||data.project!==project)return;
  if(peer){if(event.source===peer&&data.type==='presentation-clock'&&typeof data.id==='string'&&/^[a-z0-9-]{1,80}$/.test(data.id)&&typeof data.time==='number'&&Number.isFinite(data.time)&&data.time>=0&&data.time<=600000)options.apply({id:data.id,time:data.time});return;}
  const sender=event.source as Window|null;
  try{if(!sender||!options.acceptReceiver(sender))return;}catch{return;}
  if(data.type==='presentation-receiver')receivers.add(sender);
  if(data.type==='presentation-command'&&['next','previous','pause','replay'].includes(data.name))options.command(data.name);
 }
 function publish(){if(peer)return;for(const receiver of receivers){try{if(receiver.closed){receivers.delete(receiver);continue;}receiver.postMessage({type:'presentation-clock',project,...options.state()},origin);}catch{receivers.delete(receiver);}}}
 view.addEventListener('message',receive);
 if(peer)peer.postMessage({type:'presentation-receiver',project},origin);
 const timer=peer?undefined:view.setInterval(publish,200);
 return {sendCommand(name){if(!peer)return false;peer.postMessage({type:'presentation-command',project,name},origin);return true;},destroy(){view.removeEventListener('message',receive);view.clearInterval(timer);receivers.clear();}};
}
/** The application supplies the native launch adapter; this module has no HTTP route dependency. */
export function createPresentationWindowControl(options: {
  button: HTMLButtonElement;
  request: () => PresentationWindowRequest;
  launch: (request: PresentationWindowRequest) => Promise<void>;
  onState: (state: 'opening' | 'opened' | 'failed', error?: unknown) => void;
}): { open(): Promise<void>; destroy(): void } {
  let busy = false, destroyed = false;
  async function open(): Promise<void> {
    if (busy || destroyed) return;
    busy = true; options.button.disabled = true; options.onState('opening');
    try { await options.launch(options.request()); if (!destroyed) options.onState('opened'); }
    catch (error) { if (!destroyed) options.onState('failed', error); }
    finally { busy = false; if (!destroyed) options.button.disabled = false; }
  }
  const click = (): void => { void open(); };
  options.button.addEventListener('click', click);
  return { open, destroy() { destroyed = true; options.button.removeEventListener('click', click); options.button.disabled = false; } };
}
