/** Optional 2D canvas fitting. The host disables its presentation engine layout. */
export function createFlatPresentationLayout(container:HTMLElement,canvas:HTMLElement,width=1600,height=900):{layout():void;destroy():void}{
 const view=container.ownerDocument.defaultView!;
 function layout(){const scale=Math.min(container.clientWidth/width,container.clientHeight/height);if(!(scale>0))return;
  for(const [key,value] of Object.entries({width:`${width}px`,height:`${height}px`,position:'absolute',left:`${(container.clientWidth/scale-width)/2}px`,top:`${(container.clientHeight/scale-height)/2}px`,right:'auto',bottom:'auto',margin:'0',transform:'none',zoom:String(scale)}))canvas.style.setProperty(key,value,'important');
 }
 const observer=new view.ResizeObserver(layout);observer.observe(container);view.addEventListener('resize',layout);layout();
 return {layout,destroy(){observer.disconnect();view.removeEventListener('resize',layout);}};
}
