export type PageData = {[key:string]: JsonValue};
export type JsonValue = null | string | number | boolean | JsonValue[] | PageData;
export interface EvidenceAsset { id:string; title:string; path:string; type:'image/png'|'image/jpeg'|'image/webp'; bytes:number; sha256:string; kind:'capture'|'revisit'|'log'|'mock'; claim:string; source:string; capturedAt?:string }
export function validatePageData(input:unknown): PageData {
 let nodes=0;
 function read(value:unknown,depth:number):JsonValue{
  if(++nodes>10000||depth>8)throw Error('본문 데이터는 깊이 8·항목 10000개 이내여야 합니다.');
  if(value===null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(v=>read(v,depth+1));
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){const result:PageData={};for(const [key,v]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('본문 데이터 키를 확인해 주세요.');result[key]=read(v,depth+1);}return result;}
  throw Error('본문에는 JSON 데이터만 넣을 수 있습니다.');
 }
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('본문 데이터는 JSON 객체여야 합니다.');
 const result=read(input,0) as PageData;if(JSON.stringify(result).length>200000)throw Error('본문 데이터는 200000자 이내여야 합니다.');return result;
}
export function safeEvidencePath(value:unknown):value is string{return typeof value==='string'&&value.length<=240&&/^evidence\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(value)&&!value.split('/').some(p=>!p||p.startsWith('.'));}
export function validateEvidence(input:unknown):EvidenceAsset[]{
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>500)throw Error('증거 파일은 최대 500개까지 지원합니다.');
 const ids=new Set<string>();let total=0;
 return input.map(value=>{
  const e=value as Record<string,unknown>;
  if(!e||typeof e!=='object'||typeof e.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(e.id)||ids.has(e.id)||!safeEvidencePath(e.path)||!['image/png','image/jpeg','image/webp'].includes(String(e.type))||typeof e.bytes!=='number'||!Number.isInteger(e.bytes)||e.bytes<1||e.bytes>20*1024*1024||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256)||!['capture','revisit','log','mock'].includes(String(e.kind)))throw Error('증거 ID·상대 경로·형식·용량·SHA-256·촬영 성격을 확인해 주세요.');
  const text=(key:string,max:number,required=false)=>{const v=e[key]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim())||v.includes('\0'))throw Error('증거 설명·출처를 확인해 주세요.');return v.trim();};
  const capturedAt=e.capturedAt===undefined?undefined:text('capturedAt',40);if(capturedAt&&(!/^\d{4}-\d\d-\d\dT/.test(capturedAt)||!Number.isFinite(Date.parse(capturedAt))))throw Error('증거 촬영 시각은 ISO 날짜로 입력해 주세요.');
  ids.add(e.id);total+=e.bytes;if(total>250*1024*1024)throw Error('증거 합계는 250MB 이내여야 합니다.');
  return {id:e.id,title:text('title',200,true),path:e.path,type:e.type as EvidenceAsset['type'],bytes:e.bytes,sha256:e.sha256,kind:e.kind as EvidenceAsset['kind'],claim:text('claim',1000),source:text('source',1000),capturedAt};
 });
}
export function presentationPath(slides:readonly {id:string;parentId?:string;title:string}[],id:string):{id:string;title:string}[]{
 const map=new Map(slides.map(s=>[s.id,s])),path:{id:string;title:string}[]=[],seen=new Set<string>();
 while(id){const slide=map.get(id);if(!slide||seen.has(id))throw Error('상위 장표 참조가 없거나 순환합니다.');seen.add(id);path.unshift({id,title:slide.title});id=slide.parentId??'';}return path;
}
export function inspectPresentationCopy(slides:readonly {id:string;layout:string;title:string;items:readonly string[];message?:string;authored?:boolean}[]):{id:string;message:string}[]{
 const warnings:{id:string;message:string}[]=[];
 for(const s of slides){if(['cover','section','closing'].includes(s.layout))continue;
  if(s.title.length>55||s.items.some(v=>v.length>100))warnings.push({id:s.id,message:'긴 제목·본문을 줄이거나 장표를 나눠 주세요.'});
  if(!s.message)warnings.push({id:s.id,message:'이 장표에서 전달할 핵심 메시지를 확인해 주세요.'});
  if(s.items.some(v=>/카드를 선택|제품 전체 순위가 아닙니다|소규모 합성 데이터 실험입니다|할 수 있다는 점을 보여/.test(v)))warnings.push({id:s.id,message:'반복 안내·메타 문구 대신 핵심 결과와 짧은 조건을 표시해 주세요.'});
 }return warnings;
}
