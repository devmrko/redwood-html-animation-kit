import {openPresentationAiEditor} from '../../app/ai-editor.js';
const $=id=>document.getElementById(id);let captures=0;
async function report(){const value=await fetch('/fixture/report',{cache:'no-store'}).then(r=>r.json());$('result').textContent=JSON.stringify(value,null,2);return value;}
$('inspect').onclick=report;
$('open').onclick=async()=>{
 $('open').disabled=true;$('result').textContent='';captures=0;const mode=$('mode').value;
 try{
  const response=await fetch('/fixture/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});if(!response.ok)throw Error('검증 전용 서버를 실행해 주세요.');const {project}=await response.json();
  const {image}=await fetch('/fixture/png').then(r=>r.json());$('inspect').disabled=false;
  const panel=openPresentationAiEditor({project,slideId:'process',pages:new Map(),onApplied:()=>{$('status').textContent='적용 응답 수신';panel.close();void report();},captureSnapshot:async()=>{captures++;if(mode==='capture-delay'&&captures>1){$('status').textContent='합성 캡처 대기 중';await new Promise(resolve=>setTimeout(resolve,3000));}return image;}});
  panel.addEventListener('close',()=>{void report();},{once:true});$('status').textContent='편집 창에서 Update title을 요청하세요.';
 }catch(e){$('status').textContent=e.message;}finally{$('open').disabled=false;}
};
