// Oracle Corporate template assets. Project content stays in JSON.
const base='./assets/oracle-corporate/';
export const presentationTheme={id:'oracle-corporate',logoAlt:'Oracle',badge:'./assets/oracle-corporate/badge.svg',coverTitleBox:{width:840,height:168,fontSize:66.667,lineHeight:1,minFontSize:38},coverSubtitleBox:{width:840,height:62,fontSize:40,lineHeight:1.15,minFontSize:24},variants:Object.fromEntries(['light','dark'].map(mode=>[mode,{logo:base+`logo-${mode}.svg`,coverArt:base+`cover-${mode}.jpg`,closingArt:base+`closing-${mode}.svg`,dividerArt:base+`divider-${mode}.jpg` }]))};
export const projectSections=document=>document.slides.filter(slide=>slide.layout==='section').map(slide=>slide.title);
export function applySampleAppearance(doc,appearance){
 const mode=appearance==='dark'?'dark':'light',variant=presentationTheme.variants[mode];
 for(const root of doc.querySelectorAll('.reveal .slides>section')){root.dataset.template='oracle-corporate';root.dataset.appearance=mode;root.style.setProperty('--rf-divider-art',`url("${new URL(variant.dividerArt,doc.baseURI).href}")`);if(root.classList.contains('cover-slide'))root.style.backgroundImage=`url("${new URL(variant.coverArt,doc.baseURI).href}")`;}
 for(const logo of doc.querySelectorAll('.cover-logo,.brands .oracle'))logo.src=variant.logo;
 const closing=doc.querySelector('.closing-art');if(closing)closing.src=variant.closingArt;
}
