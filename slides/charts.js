import { createPresentationChart } from '../vendor/foundation/presentation-chart.js';
import { createPresentationTimeline } from '../vendor/foundation/presentation-timeline.js';
import { createPresentationGallery } from '../vendor/foundation/presentation-gallery.js';

export function createChartsSlide(root,onStateChange){
  const definitions=[
    {type:'bar',title:'유형별 수집 건수',data:[{label:'DB',value:72},{label:'문서',value:48},{label:'API',value:60}]},
    {type:'line',title:'주간 처리 건수',data:[{label:'1주',value:24},{label:'2주',value:38},{label:'3주',value:32},{label:'4주',value:56}]},
    {type:'donut',title:'지식 유형 비율',data:[{label:'용어',value:50},{label:'규칙',value:30},{label:'관계',value:20}]},
  ];
  function create(selected,notify){
    const charts=selected.map(spec=>createPresentationChart({...spec,root:root.querySelector(`#chart-${spec.type}`)}));
    const player=createPresentationTimeline({duration:2400,tracks:charts.flatMap(chart=>chart.tracks),onStateChange:notify});
    return {get state(){return player.state;},get currentTime(){return player.currentTime;},play:()=>player.play(),pause:()=>player.pause(),restart:()=>player.restart(),finish:()=>player.finish(),destroy(){player.destroy();charts.forEach(chart=>chart.destroy());}};
  }
  // Every preview has a static final chart; the owned player replaces selected previews while playing.
  const base=definitions.map(spec=>createPresentationChart({...spec,root:root.querySelector(`#chart-${spec.type}`)}));
  const player=createPresentationGallery({root,onStateChange,createOverall:notify=>create(definitions,notify),examples:definitions.map(spec=>({trigger:root.querySelector(`[data-chart-play="${spec.type}"]`),create:notify=>create([spec],notify)}))});
  return {player,destroy(){player.destroy();base.forEach(chart=>chart.destroy());}};
}
