/** Browser DOM capture and PPTX packaging ports. No network service or model required. */
export interface PowerPointSlide {id:string;title:string;notes:string}
export interface PowerPointPage {addImage(options:Record<string,unknown>):unknown;addNotes(notes:string):unknown;addText(text:unknown,options:Record<string,unknown>):unknown;addShape(shape:string,options:Record<string,unknown>):unknown;addTable(rows:unknown[][],options:Record<string,unknown>):unknown}
export interface EditablePowerPointSlide {image:string;objects:{kind:'text'|'shape'|'table'|'image';text?:unknown;shape?:string;rows?:unknown[][];options:Record<string,unknown>}[]}
export interface PowerPointWriter {
 title:string;subject:string;author:string;company:string;layout:string;theme?:Record<string,unknown>;
 defineLayout(options:{name:string;width:number;height:number}):unknown;
 addSlide():PowerPointPage;
 write(options:{outputType:'blob';compression:boolean}):Promise<Blob>;
}
export async function createPresentationPowerPoint(options:{slides:readonly PowerPointSlide[];createWriter:()=>PowerPointWriter;render:(id:string)=>Promise<string|EditablePowerPointSlide>;signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}):Promise<Blob>{
 const {slides,signal}=options;
 if(!slides.length||slides.length>60||new Set(slides.map(s=>s.id)).size!==slides.length||slides.some(s=>!s.id||typeof s.title!=='string'||typeof s.notes!=='string'||s.notes.length>6000))throw Error('PPT로 저장할 장표와 발표 노트를 확인해 주세요 (1~60장).');
 const check=()=>{if(signal?.aborted)throw new DOMException('PPT 저장을 취소했습니다.','AbortError');};check();
 const ppt=options.createWriter();ppt.defineLayout({name:'HTML_16_9',width:13.333333,height:7.5});ppt.layout='HTML_16_9';ppt.theme={headFontFace:'Oracle Sans Tab',bodyFontFace:'Oracle Sans Tab',lang:'ko-KR'};ppt.title=slides[0]!.title;ppt.subject='HTML presentation';ppt.author='';ppt.company='';
 for(const [i,entry] of slides.entries()){
  check();options.onProgress?.(i,slides.length);
  const rendered=await options.render(entry.id);check();const image=typeof rendered==='string'?rendered:rendered.image;
  if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))throw Error('장표 이미지를 만들지 못했습니다: '+entry.title);
  const page=ppt.addSlide();page.addImage({data:image,x:0,y:0,w:13.333333,h:7.5,altText:entry.title});page.addNotes(entry.notes);
  if(typeof rendered!=='string')for(const object of rendered.objects){if(object.kind==='text')page.addText(object.text!,object.options);else if(object.kind==='shape')page.addShape(object.shape!,object.options);else if(object.kind==='table')page.addTable(object.rows!,object.options);else page.addImage(object.options);}
 }
 check();options.onProgress?.(slides.length,slides.length);return ppt.write({outputType:'blob',compression:true});
}
export type PresentationPngRenderer=(node:HTMLElement,options:Record<string,unknown>)=>Promise<string>;
/** Settle media before measuring editable elements; video events may replace captions. */
export async function preparePresentationPowerPointSlide(root:HTMLElement):Promise<void>{
 const doc=root.ownerDocument,view=doc.defaultView!;
 await doc.fonts.ready;
 await Promise.all(Array.from(root.querySelectorAll('img')).map(async image=>{if(!image.complete)await image.decode();if(!image.naturalWidth)throw Error('이미지를 읽지 못했습니다: '+image.alt);}));
 await Promise.all(Array.from(root.querySelectorAll('video')).map(async video=>{
  if(video.readyState<2){
   await new Promise<void>((resolve,reject)=>{
    const done=()=>{if(video.readyState>=2){cleanup();resolve();}},failed=()=>{cleanup();reject(Error('동영상의 정지 화면을 불러오지 못했습니다.'));};
    const cleanup=()=>{view.clearTimeout(timer);video.removeEventListener('loadeddata',done);video.removeEventListener('seeked',done);video.removeEventListener('error',failed);};
    const timer=view.setTimeout(failed,10000);video.addEventListener('loadeddata',done);video.addEventListener('seeked',done);video.addEventListener('error',failed);
    // Seeking decodes a still frame without playback, which the deck clock may pause.
    video.preload='auto';video.currentTime=Math.max(.001,video.currentTime);done();
   });
  }
  video.pause();
 }));
 // Read layout synchronously: an offscreen preview iframe can suspend animation frames.
 root.getBoundingClientRect();
}
/** Export the unscaled 1600x900 page at 2x, preserving the currently finished DOM. */
export async function capturePresentationPowerPointSlide(root:HTMLElement,toPng:PresentationPngRenderer,filter?:(node:Node)=>boolean):Promise<string>{
 await preparePresentationPowerPointSlide(root);const view=root.ownerDocument.defaultView!;
 return toPng(root,{width:1600,height:900,pixelRatio:2,skipFonts:true,backgroundColor:view.getComputedStyle(root).backgroundColor,filter:(node:Node)=>!(node instanceof view.HTMLIFrameElement)&&(!filter||filter(node)),style:{position:'relative',left:'0',top:'0',margin:'0',transform:'none',translate:'none',zoom:'1',width:'1600px',height:'900px'}});
}
