import {openBrowserPresentation,notifyPresentationReady} from './vendor/foundation/presentation-window.js';
/** Host adapter: browser popup is the default; native app launch is explicit. */
export function launchPresentation(request,mode='browser'){
 const url=new URL(request.project?'./deck.html':document.body.dataset.offlineSamples?'./samples.html':'./index.html',location.href);
 if(request.project)url.searchParams.set('project',request.project);
 url.searchParams.set('audience','');url.searchParams.set('layout',new URLSearchParams(location.search).get('layout')||'flat');url.hash=`/${request.slide}`;
 if(mode==='browser')return openBrowserPresentation(window,url.href,request);
 return (async()=>{
  const launchToken=crypto.randomUUID().replaceAll('-','');
  const response=await fetch('/api/presentation-window',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,launchToken,browser:mode==='app-chrome'?'chrome':'edge'})});
  if(!response.ok)throw Error('앱 창 실행에 실패했습니다. 현재 브라우저 창 모드로 다시 시도해 주세요.');
  for(let i=0;i<60;i++){
   const state=await fetch(`/api/presentation-window/status/${launchToken}`,{cache:'no-store'}).then(r=>r.json());
   if(state.ready)return;if(state.error)throw Error(state.error);
   await new Promise(r=>setTimeout(r,200));
  }
  throw Error('앱 창의 준비를 확인하지 못했습니다. 현재 브라우저 창 모드로 다시 시도해 주세요.');
 })();
}
export function reportPresentationReady(error){
 notifyPresentationReady(window,error);
 const token=new URLSearchParams(location.search).get('launchToken');
 if(token)void fetch('/api/presentation-window/ready',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({launchToken:token,error})}).catch(()=>{});
}
