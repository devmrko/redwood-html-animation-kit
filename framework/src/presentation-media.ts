export interface PresentationMedia {id:string;title:string;kind:'file'|'youtube';path?:string;type?:'video/mp4'|'video/webm';bytes?:number;sha256?:string;videoId?:string;start:number;end:number;at:number;muted:boolean}
export function youtubeVideoId(value:string):string{
 if(/^[A-Za-z0-9_-]{11}$/.test(value))return value;
 let url:URL;try{url=new URL(value);}catch{throw Error('YouTube 주소 또는 영상 ID를 확인해 주세요.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('HTTPS YouTube 주소만 지원합니다.');
 const host=url.hostname.toLowerCase();let id='';
 if(host==='youtu.be')id=url.pathname.slice(1);else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){id=url.pathname==='/watch'?url.searchParams.get('v')??'':/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1]??'';}
 if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw Error('지원하는 YouTube 영상 주소가 아닙니다.');return id;
}
export function validateMedia(input:unknown):PresentationMedia[]{
 if(input===undefined)return [];if(!Array.isArray(input)||input.length>50)throw Error('동영상은 최대 50개까지 지원합니다.');
 const ids=new Set<string>();let total=0;
 return input.map(value=>{const m=value as Record<string,unknown>;if(!m||typeof m!=='object'||typeof m.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(m.id)||ids.has(m.id)||typeof m.title!=='string'||!m.title.trim()||m.title.length>200||!['file','youtube'].includes(String(m.kind)))throw Error('동영상 ID·제목·종류를 확인해 주세요.');
  const start=m.start??0,end=m.end,at=m.at??0,muted=m.muted??true;
  if(typeof start!=='number'||!Number.isFinite(start)||start<0||typeof end!=='number'||!Number.isFinite(end)||end<=start||end>86400||typeof at!=='number'||!Number.isFinite(at)||at<0||at+end-start>600||typeof muted!=='boolean')throw Error('동영상 시작·끝·등장 시간과 음소거 설정을 확인해 주세요 (장표 내 최대 600초).');
  ids.add(m.id);
  if(m.kind==='youtube'){if(typeof m.videoId!=='string')throw Error('YouTube 영상 ID가 없습니다.');return {id:m.id,title:m.title,kind:'youtube',videoId:youtubeVideoId(m.videoId),start,end,at,muted};}
  if(typeof m.path!=='string'||m.path.length>240||!/^media\/[A-Za-z0-9_./-]+\.(?:mp4|webm)$/i.test(m.path)||m.path.split('/').some(p=>!p||p.startsWith('.'))||!['video/mp4','video/webm'].includes(String(m.type))||typeof m.bytes!=='number'||!Number.isInteger(m.bytes)||m.bytes<1||m.bytes>100*1024*1024||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('동영상 파일 경로·형식·용량·SHA-256을 확인해 주세요.');
  total+=m.bytes;if(total>250*1024*1024)throw Error('동영상 파일 합계는 250MB 이내여야 합니다.');
  return {id:m.id,title:m.title,kind:'file',path:m.path,type:m.type as PresentationMedia['type'],bytes:m.bytes,sha256:m.sha256,start,end,at,muted};
 });
}
export interface PresentationMediaView {root:HTMLElement;entry:PresentationMedia;sync(time:number,playing:boolean,rate:number):void;pause():void;destroy():void}
const views=new WeakMap<Element,PresentationMediaView>();
export function presentationMediaViews(root:HTMLElement):PresentationMediaView[]{return Array.from(root.querySelectorAll('[data-media-id]')).map(el=>views.get(el)).filter((v):v is PresentationMediaView=>!!v);}
export function createPresentationMedia(doc:Document,input:PresentationMedia):PresentationMediaView{
 const m=validateMedia([input])[0]!,root=doc.createElement('figure');root.className='rf-media';root.dataset.mediaId=m.id;
 const viewport=doc.createElement('div');viewport.className='rf-media-viewport';
 const stage=doc.createElement('div');stage.className='rf-media-stage';viewport.append(stage);
 const caption=doc.createElement('figcaption');caption.textContent=m.title;root.append(viewport,caption);
 let video:HTMLVideoElement|undefined,frame:HTMLIFrameElement|undefined,lastTarget=m.start,playPending=false;
 const pause=()=>{if(video)video.pause();if(frame){frame.remove();frame=undefined;load!.hidden=false;}};
 let load:HTMLButtonElement|undefined;
 if(m.kind==='file'){
  video=doc.createElement('video');video.src=m.path!;video.controls=true;video.preload='metadata';video.playsInline=true;video.muted=m.muted;video.setAttribute('aria-label',m.title);stage.append(video);
  video.addEventListener('loadedmetadata',()=>{video!.currentTime=Math.min(lastTarget,Math.max(0,video!.duration-.01));if(m.end>video!.duration+.2)caption.textContent=m.title+' · 끝 시간이 영상 길이를 초과합니다.';});
  video.addEventListener('playing',()=>{caption.textContent=m.title;});
  video.addEventListener('timeupdate',()=>{if(video!.currentTime>=m.end){video!.pause();if(video!.currentTime>m.end+.02)video!.currentTime=m.end;}});
  video.addEventListener('error',()=>{caption.textContent=m.title+' · 동영상을 재생하지 못했습니다. 파일·코덱·해시를 확인해 주세요.';});
 }else{
  load=doc.createElement('button');load.type='button';load.textContent='YouTube 영상 불러오기';load.onclick=()=>{if(frame)return;const url=new URL('https://www.youtube.com/embed/'+m.videoId);url.searchParams.set('start',String(Math.floor(m.start)));url.searchParams.set('end',String(Math.ceil(m.end)));url.searchParams.set('playsinline','1');url.searchParams.set('rel','0');
   frame=doc.createElement('iframe');frame.src=url.href;frame.title=m.title;frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';stage.append(frame);load!.hidden=true;};stage.append(load);
 }
 const result:PresentationMediaView={root,entry:m,sync(time,playing,rate){const elapsed=time/1000-m.at;lastTarget=m.start+Math.max(0,Math.min(m.end-m.start,elapsed));if(!video)return;if(video.readyState>=1&&(!playing||Math.abs(video.currentTime-lastTarget)>.5))video.currentTime=Math.min(lastTarget,Math.max(0,video.duration-.01));video.playbackRate=rate;if(playing&&elapsed>=0&&elapsed<m.end-m.start){if(video.paused&&!playPending){playPending=true;void video.play().catch(error=>{if(error?.name==='NotAllowedError')caption.textContent=m.title+' · 재생 버튼을 눌러 주세요.';}).finally(()=>{playPending=false;});}}else video.pause();},pause,destroy(){pause();if(video){video.removeAttribute('src');video.load();}root.remove();}};
 views.set(root,result);return result;
}

/** Lay out only automatically appended media; authored placements keep their own geometry. */
export function layoutPresentationMedia(body:HTMLElement,roots:HTMLElement[],mode:'auto'|'focus'|'balanced'='auto'):void{
 if(!roots.length)return;
 const doc=body.ownerDocument,copy=doc.createElement('div'),grid=doc.createElement('div');
 copy.className='rf-media-copy';grid.className='rf-media-grid';grid.dataset.count=String(roots.length);
 const mediaRoots=new Set<Node>(roots);
 for(const child of Array.from(body.childNodes))if(!mediaRoots.has(child))copy.append(child);
 grid.append(...roots);body.replaceChildren();
 body.classList.add('rf-document-body--media');body.dataset.mediaLayout=mode;
 if(copy.childNodes.length){body.classList.add('rf-media-with-copy');body.append(copy);}
 body.append(grid);
}
