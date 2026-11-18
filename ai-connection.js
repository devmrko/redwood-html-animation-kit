import {createPresentationAiConnection} from './vendor/foundation/presentation-ai-connection.js';
export function createAppAiConnection(onChange){
 let storage;try{storage=localStorage;}catch{}
 const query=new URLSearchParams(location.search),initial={};for(const key of ['provider','tool','model','profile','region','compartment','apiFormat'])if(query.has('ai-'+key))initial[key]=query.get('ai-'+key);
 return createPresentationAiConnection(document,{storage,initial,onChange,loadCapabilities:async()=>{const response=await fetch('/api/ai/capabilities',{cache:'no-store'});if(!response.ok)throw Error('AI 연결 서버가 없습니다. AI 편집 시작 파일을 실행해 주세요.');return response.json();}});
}
