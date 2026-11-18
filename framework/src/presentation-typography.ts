/** Use the same Latin face and explicit Korean fallback in HTML and editable PPT. */
export interface PresentationFontRun {text:string;options:{fontFace:string;lang:string}}
export function presentationFontFamilies(stack:string,platform='',available?:(family:string)=>boolean): {latin:string;eastAsian:string}{
 const names=stack.split(',').map(v=>v.trim().replace(/^["']|["']$/g,''));const latin=(available?names.find(available):names[0])||'Arial';
 if(!/Oracle Sans/i.test(latin))return {latin,eastAsian:latin};
 const fallback=/Mac|iPhone|iPad/i.test(platform)?'Apple SD Gothic Neo':/Win/i.test(platform)?'Malgun Gothic':'Noto Sans KR';
 return {latin,eastAsian:names.includes(fallback)&&(!available||available(fallback))?fallback:names.find(v=>/Gothic|고딕|Noto Sans KR/i.test(v)&&(!available||available(v)))||fallback};
}
export function presentationFontRuns(text:string,fonts:{latin:string;eastAsian:string}):PresentationFontRun[]{
 const runs:PresentationFontRun[]=[];
 for(const char of text){const cjk=/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff]/u.test(char),fontFace=cjk?fonts.eastAsian:fonts.latin,lang=cjk?'ko-KR':'en-US',last=runs.at(-1);if(last?.options.fontFace===fontFace&&last.options.lang===lang)last.text+=char;else runs.push({text:char,options:{fontFace,lang}});}
 return runs;
}
