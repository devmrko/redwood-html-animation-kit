import {openPresentationProjectStore} from './vendor/foundation/presentation-project-store.js';
/** Application route adapter; common storage and views have no endpoint dependency. */
const revisions=new Map();
export function openAppProjectStore(){return openPresentationProjectStore('presentation-projects-v1',{
 async publish(project){const response=await fetch(`/api/projects/${project.document.id}`,{method:'POST',headers:{'Content-Type':'application/json',...(revisions.get(project.document.id)?{'If-Match':revisions.get(project.document.id)}:{})},body:JSON.stringify(project)});if(!response.ok)throw Error(response.status===409?'다른 창에서 변경됐습니다. 새로고침 후 다시 저장해 주세요.':'프로젝트를 로컬 서버에 연결하지 못했습니다. start.py 서버를 다시 실행하고 JSON을 저장해 주세요.');revisions.set(project.document.id,(await response.json()).revision||'');},
 async retrieve(id){const response=await fetch(`/api/projects/${id}`,{cache:'no-store'});if(response.status===404)return undefined;if(!response.ok)throw Error('로컬 프로젝트를 불러오지 못했습니다.');revisions.set(id,response.headers.get('ETag')||'');return response.json();}
});}
