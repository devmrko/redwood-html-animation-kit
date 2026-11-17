export const documentLayouts = ['cover', 'section', 'content', 'photo', 'steps', 'comparison', 'closing'] as const;
export type DocumentLayout = typeof documentLayouts[number];
export interface DocumentSlide {
  id: string; layout: DocumentLayout; section: string; title: string; subtitle: string;
  items: string[]; notes: string; imageId?: string; imageAlt: string; duration?: number;
  design?: string; authored?: boolean;
}
export interface PresentationDocument { version: 1; id: string; title: string; presenter: string; scenario: string; brief?: string; slides: DocumentSlide[] }
export interface PresentationAsset { id: string; name: string; type: 'image/png' | 'image/jpeg' | 'image/webp'; dataUrl: string }
export interface PresentationProject { document: PresentationDocument; assets: PresentationAsset[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validProjectId(value: string): boolean { return uuid.test(value); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('문서 형식을 확인해 주세요.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value) || (required && !value.trim())) throw Error(`문서 텍스트를 확인해 주세요 (${max}자 이내).`);
  return value.trim();
}
export function validatePresentationDocument(input: unknown): PresentationDocument {
  const doc = object(input);
  if (doc.version !== 1 || typeof doc.id !== 'string' || !validProjectId(doc.id) || !Array.isArray(doc.slides) || !doc.slides.length || doc.slides.length > 60) throw Error('지원하는 문서 버전·ID·장표 수(1~60장)를 확인해 주세요.');
  const ids = new Set<string>();
  const slides = doc.slides.map(value => {
    const s = object(value), id = text(s.id, 80, true);
    if (!/^[a-z0-9-]+$/.test(id) || ids.has(id) || !documentLayouts.includes(s.layout as DocumentLayout)) throw Error('장표 ID 또는 레이아웃이 올바르지 않습니다.');
    ids.add(id);
    if (!Array.isArray(s.items) || s.items.length > 6) throw Error('장표 항목은 6개 이내로 입력해 주세요.');
    const imageId = s.imageId == null || s.imageId === '' ? undefined : text(s.imageId, 80, true);
    if (imageId && !/^[a-z0-9-]+$/.test(imageId)) throw Error('사진 ID를 확인해 주세요.');
    const duration = s.duration;
    if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1 || duration > 600)) throw Error('장표 시간은 1~600초로 입력해 주세요.');
    if(s.authored!==undefined && typeof s.authored!=='boolean')throw Error('페이지 제작 상태를 확인해 주세요.');
    return { id, layout: s.layout as DocumentLayout, section: text(s.section ?? '', 120), title: text(s.title, 100, true), subtitle: text(s.subtitle ?? '', 220),
      items: s.items.map(item => text(item, 240, true)), notes: text(s.notes ?? '', 6000), imageId, imageAlt: text(s.imageAlt ?? '', 240), duration,
      design:s.design===undefined?undefined:text(s.design,4000), authored:s.authored as boolean | undefined };
  });
  return { version: 1, id: doc.id, title: text(doc.title, 100, true), presenter: text(doc.presenter ?? '', 200), scenario: text(doc.scenario ?? '', 30000), brief:doc.brief===undefined?undefined:text(doc.brief,4000), slides };
}
function sniff(bytes: Uint8Array): PresentationAsset['type'] | undefined {
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return undefined;
}
export function validatePresentationProject(input: unknown): PresentationProject {
  const project = object(input), document = validatePresentationDocument(project.document);
  if (!Array.isArray(project.assets) || project.assets.length > 20) throw Error('사진은 최대 20개까지 넣을 수 있습니다.');
  let total = 0;
  const ids = new Set<string>();
  const assets = project.assets.map(value => {
    const asset = object(value), id = text(asset.id, 80, true), name = text(asset.name, 200, true);
    if (!/^[a-z0-9-]+$/.test(id) || ids.has(id)) throw Error('중복되거나 잘못된 사진 ID입니다.');
    ids.add(id);
    if (typeof asset.dataUrl !== 'string' || asset.dataUrl.length > 7_000_000) throw Error('사진은 파일당 5MB 이내로 넣어 주세요.');
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(asset.dataUrl);
    if (!match || match[1] !== asset.type || match[2]!.length % 4 !== 0) throw Error('PNG·JPEG·WebP 사진만 지원합니다.');
    const encoded = match[2]!, size = encoded.length * .75 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    total += size;
    let prefix: Uint8Array;
    try { prefix = Uint8Array.from(atob(encoded.slice(0,24)), c => c.charCodeAt(0)); }
    catch { throw Error('손상된 사진 데이터입니다.'); }
    if (size > 5 * 1024 * 1024 || total > 25 * 1024 * 1024 || sniff(prefix) !== asset.type) throw Error('사진 형식 또는 용량을 확인해 주세요 (각 5MB·전체 25MB).');
    return { id, name, type: asset.type as PresentationAsset['type'], dataUrl: asset.dataUrl };
  });
  if (document.slides.some(slide => slide.imageId && !ids.has(slide.imageId))) throw Error('장표가 참조한 사진을 찾을 수 없습니다.');
  return { document, assets };
}
export async function readPresentationPhotos(files: readonly File[]): Promise<PresentationAsset[]> {
  if (files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) throw Error('사진은 최대 20개·전체 25MB까지 넣을 수 있습니다.');
  return Promise.all(files.map(async (file, index) => {
    if (!file.size || file.size > 5 * 1024 * 1024) throw Error('사진은 파일당 5MB 이내로 넣어 주세요.');
    const type = sniff(new Uint8Array(await file.slice(0,16).arrayBuffer()));
    if (!type || file.type !== type) throw Error('PNG·JPEG·WebP 사진만 지원합니다.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('사진을 읽지 못했습니다.')); reader.readAsDataURL(file);
    });
    return { id: `photo-${index + 1}`, name: file.name, type, dataUrl };
  }));
}
export function makeDocumentSlide(id: string, title: string, layout: DocumentLayout = 'content'): DocumentSlide {
  return { id, title, layout, section: '', subtitle: '', items: [], notes: '', imageAlt: '' };
}
export function firstContentSlide(document: PresentationDocument): number {
  const index = document.slides.findIndex(slide => !['cover','section','closing'].includes(slide.layout));
  return Math.max(0,index);
}
/** Drafts may be edited with empty fields, but cannot be presented as complete pages. */
export function assertPresentationContent(document: PresentationDocument): void {
  const empty=document.slides.find(slide=>!['cover','section','closing'].includes(slide.layout) && !slide.items.length && !slide.imageId && !slide.authored);
  if(empty)throw Error(`‘${empty.title}’ 장표의 본문이 없습니다. 본문 항목이나 사진을 넣어 주세요.`);
}
/** Generated decks always include the template's highlighted agenda dividers. */
export function addPresentationDividers(document: PresentationDocument): PresentationDocument {
  if(document.slides.some(slide=>slide.layout==='section'))return document;
  const used=new Set(document.slides.map(slide=>slide.id)),slides:DocumentSlide[]=[];
  let active='',number=0;
  for(const slide of document.slides){
    if(['cover','closing'].includes(slide.layout)){slides.push(slide);continue;}
    const section=slide.section && slide.section!=='섹션' ? slide.section : '주요 내용';
    if(section!==active){let id;do{id=`agenda-${++number}`;}while(used.has(id));used.add(id);slides.push({...makeDocumentSlide(id,section,'section'),section,notes:`${section} 항목을 설명합니다.`});active=section;}
    slides.push({...slide,section});
  }
  return validatePresentationDocument({...document,slides});
}
/** Deterministic baseline; prose is kept as notes and layouts stay editable. */
export function createDocumentFromScenario(scenario: string, assets: readonly PresentationAsset[], options: { id: string; title?: string; presenter?: string }): PresentationDocument {
  scenario = text(scenario, 30000, true);
  const lines = scenario.split(/\r?\n/), heading = lines.find(line => /^#\s/.test(line));
  const title = (options.title?.trim() || heading?.replace(/^#\s+/, '') || lines.find(line => line.trim()) || '발표').slice(0,100);
  const hasHeadings = lines.some(line => /^#{2,3}\s/.test(line));
  const groups: { title: string; section: string; body: string[] }[] = [];
  let section = '', group: typeof groups[number] | undefined;
  for (const line of lines) {
    if (/^#\s/.test(line)) continue;
    const h = /^(#{2,3})\s+(.+)/.exec(line);
    if (h) {
      if (h[1] === '##') section = h[2]!;
      group = { title: h[2]!.slice(0,100), section, body: [] }; groups.push(group);
    } else if (!hasHeadings && (!line.trim() || /^---+$/.test(line.trim()))) { group = undefined; }
    else if (line.trim()) {
      if (!group) { group = { title: hasHeadings ? title : line.replace(/^[-*\d.)\s]+/, '').slice(0,80), section, body: [] }; groups.push(group); }
      group.body.push(line.trim());
    }
  }
  if(!groups.some(group=>group.body.some(line=>line.replace(/^(?:[-*]|\d+[.)])\s+/, '').trim())) && !assets.length)
    throw Error('시나리오에 본문이 없습니다. 제목 아래에 설명이나 목록을 입력해 주세요.');
  const slides: DocumentSlide[] = [{...makeDocumentSlide('cover',title,'cover'),subtitle:groups.map(group=>group.section||group.title).filter((value,index,all)=>all.indexOf(value)===index).join(' · ').slice(0,220),notes:title}];
  let photo = 0;
  for (const g of groups) {
    const source = g.body.join('\n'), bullets = g.body.filter(line => /^(?:[-*]|\d+[.)])\s+/.test(line));
    const prose=bullets.length ? g.body.filter(line=>!/^(?:[-*]|\d+[.)])\s+/.test(line)).join(' ') : '';
    const subtitle=prose.length<=220 ? prose : '';
    const parts = (bullets.length ? bullets : g.body.flatMap(line => line.split(/(?<=[.!?。！？])\s+/u))).map(line => line.replace(/^(?:[-*]|\d+[.)])\s+/, '')).filter(Boolean);
    if(prose && !subtitle)parts.unshift(prose);
    const items = parts.flatMap(part => Array.from({length:Math.ceil(part.length/200)},(_,i)=>part.slice(i*200,(i+1)*200)));
    const numbered = bullets.filter(line => /^\d+[.)]/.test(line)).length >= 2;
    const batches: string[][]=[[]];
    for(const item of items){let batch=batches[batches.length-1]!;if(batch.length && (batch.length>=6 || batch.join('').length+item.length>320)){batch=[];batches.push(batch);}batch.push(item);}
    for (const [offset,batch] of batches.entries()) {
      const layout: DocumentLayout = !source && g.section ? 'section' : numbered || /단계|순서|절차/.test(g.title) ? 'steps' : /비교|전후|이전과|차이/.test(g.title) ? 'comparison' : assets[photo] ? 'photo' : 'content';
      const image = layout==='section' ? undefined : assets[photo];
      slides.push({...makeDocumentSlide(`scene-${slides.length}`,g.title + (offset ? ' · 계속' : ''),layout),section:g.section,subtitle:offset?'':subtitle,items:batch,notes:(batches.length===1?source||g.title:batch.join('\n')).slice(0,6000),imageId:image?.id,imageAlt:image?.name ?? ''});
      if (image) photo++;
    }
  }
  for (;photo<assets.length;photo++) {
    const image=assets[photo]!;
    slides.push({...makeDocumentSlide(`scene-${slides.length}`,image.name.slice(0,100),'photo'),imageId:image.id,imageAlt:image.name});
  }
  slides.push({...makeDocumentSlide('closing','감사합니다.','closing'),notes:'발표를 마치고 질문을 받습니다.'});
  return addPresentationDividers(validatePresentationDocument({version:1,id:options.id,title,presenter:options.presenter ?? '',scenario,slides}));
}
