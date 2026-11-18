import {createPresentationTimeline} from '../vendor/foundation/presentation-timeline.js';
import {createComparisonTable,createCostTable} from '../vendor/foundation/presentation-tables.js';

/** Starter only. Replace the body with the user's requested table/SVG/photo layout. */
export function renderPage({body,slide,data,assets,document:doc}){
 if(slide.mediaIds?.length&&!slide.items.length&&!slide.imageId&&!Object.keys(data).length){body.replaceChildren();return {player:createPresentationTimeline({duration:1000,tracks:[{element:body,keyframes:[{opacity:1},{opacity:1}]}]})};}
 const canvas=doc.createElement('div');
 canvas.style.cssText='width:100%;height:100%;display:flex;gap:36px;align-items:center';
 const copy=doc.createElement('div');copy.style.cssText='flex:1;min-width:0';
 const draft=doc.createElement('p');draft.textContent='제작 전 초안';draft.style.cssText='font-size:20px;margin:0 0 20px;color:var(--rf-accent)';copy.append(draft);
 const entries=Array.isArray(data.blocks)&&data.blocks.every(v=>typeof v==='string')?data.blocks:slide.items.length?slide.items:[slide.subtitle||slide.title];
 let elements;
 if(data.type==='comparison'||data.type==='cost'){
  const table=data.type==='comparison'?createComparisonTable(doc,data):createCostTable(doc,data.rows);copy.append(table);elements=[...table.querySelectorAll('tbody tr')];
 }else elements=entries.map(text=>{const p=doc.createElement('p');p.textContent=text;p.style.cssText='font-size:28px;line-height:1.5;margin:0 0 16px';copy.append(p);return p;});
 canvas.append(copy);
 const asset=assets.get(slide.imageId);
 if(asset){const img=doc.createElement('img');img.src=asset.dataUrl;img.alt=slide.imageAlt||asset.name;img.style.cssText='width:42%;height:100%;object-fit:contain';canvas.append(img);}
 body.replaceChildren(canvas);
 const duration=Math.max(4000,elements.length*3000+1000);
 const tracks=elements.map((element,i)=>({element,keyframes:[{offset:0,opacity:0},{offset:i*3000/duration,opacity:0},{offset:(i*3000+600)/duration,opacity:1},{offset:1,opacity:1}]}));
 const player=createPresentationTimeline({duration,tracks});
 return {player,stepTimes:elements.map((_,i)=>(i*3000+600)/1000)};
}
