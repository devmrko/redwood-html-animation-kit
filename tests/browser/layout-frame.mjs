import {renderPresentationDocument} from '../../vendor/foundation/presentation-document-view.js';
import {createFlatPresentationLayout,createAdaptivePresentationToolbar} from '../../vendor/foundation/presentation-layout.js';
import {createComparisonTable} from '../../vendor/foundation/presentation-tables.js';
import {createPresentationChart} from '../../vendor/foundation/presentation-chart.js';
import {createPresentationTimeline} from '../../vendor/foundation/presentation-timeline.js';
import {presentationTheme} from '../../app/template-theme.js';
const toolbar=document.querySelector('.deck-toolbar'),stage=document.querySelector('#document-slides');
// Reuse the real toolbar markup and production CSS, not a simplified button row.
const source=new DOMParser().parseFromString(await fetch('./app/deck.html').then(r=>r.text()),'text/html');toolbar.append(...source.querySelector('.deck-toolbar').childNodes);
const adaptive=createAdaptivePresentationToolbar(toolbar,{property:'--deck-toolbar-height'}),fit=createFlatPresentationLayout(document.querySelector('.reveal'),stage);
const photo=await fetch('./assets/redwood-cover.jpeg').then(r=>r.blob()).then(blob=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);}));
let active;
const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const within=(box,parent,tolerance=2)=>box.left>=parent.left-tolerance&&box.right<=parent.right+tolerance&&box.top>=parent.top-tolerance&&box.bottom<=parent.bottom+tolerance;
window.inspectLayout=async({kind,appearance,audience})=>{
 active?.destroy();document.body.classList.toggle('is-audience',audience);adaptive.layout();
 const mediaCount=kind.startsWith('video')?Number(kind.slice(-1)):0;
 const slide={id:'check',layout:kind==='photo'?'photo':'content',title:'구성요소는 본문 안에 표시됩니다',items:kind==='photo'?['사진의 원본 비율을 유지합니다.']:[],notes:'공개 합성 자료',authored:kind!=='photo'&&kind!=='video4',...(kind==='photo'?{imageId:'photo'}:{}),...(mediaCount?{mediaIds:Array.from({length:mediaCount},(_,i)=>'clip-'+i),mediaLayout:'balanced'}:{})};
 const project={document:{id:'44444444-4444-4444-8444-444444444444',version:1,title:'구성요소 검증',presenter:'',scenario:'',appearance,slides:[slide]},assets:[{id:'photo',name:'공개 사진',type:'image/jpeg',dataUrl:photo}],media:Array.from({length:mediaCount},(_,i)=>({id:'clip-'+i,title:'합성 영상 '+(i+1),kind:'file',path:'media/fixture.mp4',type:'video/mp4',bytes:1,sha256:'0'.repeat(64),start:0,end:3,at:0,muted:true}))};
 const factory=({body,document:doc})=>{
  let tracks=[];
  if(kind.startsWith('chart')){const chart=doc.createElement('div');chart.className='rf-chart';body.append(chart);tracks=createPresentationChart({root:chart,type:kind.slice(6),title:'공개 데이터',data:[{label:'A',value:30},{label:'B',value:50},{label:'C',value:20}]}).tracks;}
  else{const table=createComparisonTable(doc,{density:'compact',columns:['제품 A','제품 B'],rows:[{label:'실행',cells:[{text:'성공',status:'success'},{text:'조건부',status:'limited'}]},{label:'비용',cells:[{text:'작업당 10',status:'untested'},{text:'작업당 20',status:'untested'}]}]});body.append(table);tracks=[{element:table,keyframes:[{opacity:0},{opacity:1}]}];}
  return {player:createPresentationTimeline({duration:1000,tracks})};
 };
 active=renderPresentationDocument(project,stage,presentationTheme,{pages:new Map([['check',factory]]),textMotion:false});const view=active.slides[0];view.root.classList.add('present');view.player.finish();
 const videos=[...stage.querySelectorAll('video')];
 await Promise.all(videos.map(video=>new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{cleanup();reject(Error('검증 영상 메타데이터 시간 초과'));},5000);
  const cleanup=()=>{clearTimeout(timeout);video.removeEventListener('loadedmetadata',loaded);video.removeEventListener('error',failed);};
  const loaded=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(Error('검증 영상 파일을 읽지 못함'));};
  video.addEventListener('loadedmetadata',loaded);video.addEventListener('error',failed);video.src='./dist/layout/media/fixture.mp4';
 })));
 await document.fonts.ready;await Promise.all([...stage.querySelectorAll('img')].map(image=>image.decode()));fit.layout();await tick();
 const failures=[],check=(ok,label)=>{if(!ok)failures.push(label);},root=view.root,box=root.getBoundingClientRect(),body=root.querySelector('.rf-document-body'),bodyBox=body.getBoundingClientRect(),container=document.querySelector('.reveal').getBoundingClientRect();
 check(within(box,container),'장표가 표시 영역을 벗어남');check(box.width>0&&box.height>0,'빈 장표');check(Math.abs(box.width/box.height-16/9)<.01,'장표 비율');
 check(root.querySelector('.rf-document-heading').getBoundingClientRect().bottom<=bodyBox.top+1,'제목과 본문 겹침');
 for(const video of videos)check(video.videoWidth===640&&video.videoHeight===360&&!video.error,'영상 디코딩 실패');
 check(document.documentElement.scrollWidth<=innerWidth+2,'가로 스크롤');
 if(!audience){check(container.top>=toolbar.getBoundingClientRect().bottom,'도구 모음과 본문 겹침');for(const control of toolbar.children)check(within(control.getBoundingClientRect(),toolbar.getBoundingClientRect()),'도구 모음 항목 잘림');}
 for(const element of body.querySelectorAll('table,img,svg,.rf-media,.rf-media-stage,figcaption,.rf-document-item')){const b=element.getBoundingClientRect();check(within(b,bodyBox),element.tagName+' 본문 밖으로 넘침');check(b.width>0&&b.height>0,element.tagName+' 빈 크기');}
 for(const element of body.querySelectorAll('th,td,figcaption,.rf-document-item')){check(element.scrollWidth<=element.clientWidth+2&&element.scrollHeight<=element.clientHeight+2,element.tagName+' 텍스트 잘림');}
 for(const media of body.querySelectorAll('.rf-media')){const screen=media.querySelector('.rf-media-stage').getBoundingClientRect(),caption=media.querySelector('figcaption').getBoundingClientRect();check(Math.abs(screen.width/screen.height-16/9)<.02,'영상 비율');check(screen.bottom<=caption.top+1,'영상과 설명 겹침');}
 return {failures,scale:box.width/1600,toolbarHeight:toolbar.getBoundingClientRect().height};
};
window.addEventListener('pagehide',()=>{active?.destroy();fit.destroy();adaptive.destroy();},{once:true});
document.body.dataset.ready='true';
