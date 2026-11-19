import { readFile, readdir, stat, access } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(resolve(root,path),'utf8');
const html=await read('examples/animations/index.html');
if((html.match(/<section /g)||[]).length!==13)throw Error('Expected 13 pages');
if((html.match(/data-effect-play=/g)||[]).length!==30 || (html.match(/data-chart-play=/g)||[]).length!==3)throw Error('Expected 33 click samples');
for(const name of ['examples/animations/index.html','examples/animations/main.js','README.md','examples/components/index.html'])if(/제네시스랩|Genesislab|슬립박스|\/Users\//i.test(await read(name)))throw Error(`Unshared content in ${name}`);
const manifest=JSON.parse(await read('vendor/foundation/manifest.json'));
for(const [name,hash] of Object.entries({...manifest.modules,...manifest.styles})){
 const bytes=await readFile(resolve(root,'vendor/foundation',name));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error(`Vendor hash mismatch: ${name}`);
}
for(const directory of ['html-to-image','pptxgenjs']){
 const source=JSON.parse(await read(`vendor/${directory}/source.json`));
 for(const [name,hash] of Object.entries(source.sha256))if(createHash('sha256').update(await readFile(resolve(root,'vendor',directory,name))).digest('hex')!==hash)throw Error(`Vendor hash mismatch: ${directory}/${name}`);
}
const visited=new Set();
async function inspect(path){
 path=resolve(path);if(visited.has(path))return;visited.add(path);
 const source=await readFile(path,'utf8');
 if(extname(path)==='.html')for(const script of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(script[2].trim()&&!/type=["']application\/json/.test(script[1]))execFileSync(process.execPath,['--input-type=module','--check'],{input:script[2],stdio:['pipe','pipe','pipe']});}
 const markup=extname(path)==='.html'?source.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi,'$1</script>').replace(/<base\b[^>]*>/gi,''):source;
 if(['.js','.mjs'].includes(extname(path)))execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 if(/vendor\/(?:html-to-image|pptxgenjs)\//.test(path))return;
 const base=extname(path)==='.html'?resolve(dirname(path),source.match(/<base\b[^>]*href=["']([^"']+)["']/i)?.[1]??'.'):dirname(path);
 const refs=extname(path)==='.html'?[...markup.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]):extname(path)==='.css'?[...source.matchAll(/(?:url\(\s*|@import\s+)["']?([^"'\s)]+)["']?\)?/g)].map(m=>m[1]):[...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map(m=>m[1]);
 for(const ref of refs){if(!ref||/^(?:https?:|data:|about:|#)/.test(ref))continue;const next=resolve(base,ref.split(/[?#]/)[0]);await stat(next);if(['.js','.mjs','.css','.html'].includes(extname(next)))await inspect(next);}
}
for(const entry of ['index.html','app/builder.html','app/deck.html','app/export.html','app/ai-start.html','examples/animations/index.html','examples/animations/samples.html','examples/components/index.html','examples/components/standalone.html'])await inspect(resolve(root,entry));
for(const entry of ['examples/usage-demo/open.html','tests/browser/smoke.html']){try{await access(resolve(root,entry));}catch{continue;}await inspect(resolve(root,entry));}
execFileSync('python3',['scripts/build_samples.py','--check'],{cwd:root,stdio:'pipe'});
const samples=(await read('examples/animations/samples.html')).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');if((samples.match(/<section /g)||[]).length!==13||(samples.match(/data-effect-play=/g)||[]).length!==30||(samples.match(/data-chart-play=/g)||[]).length!==3)throw Error('Animation sample catalog is incomplete');
console.log(`Passed: 13 pages, 33 samples, branding cleanup, module/CSS hashes and ${visited.size} linked files.`);
