import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(resolve(root,path),'utf8');
const html=await read('index.html');
if((html.match(/<section /g)||[]).length!==8)throw Error('Expected 8 pages');
if((html.match(/data-effect-play=/g)||[]).length!==30 || (html.match(/data-chart-play=/g)||[]).length!==3)throw Error('Expected 33 click samples');
for(const name of ['index.html','main.js','README.md','components.html'])if(/제네시스랩|Genesislab|슬립박스|\/Users\//i.test(await read(name)))throw Error(`Unshared content in ${name}`);
const manifest=JSON.parse(await read('vendor/foundation/manifest.json'));
for(const [name,hash] of Object.entries({...manifest.modules,...manifest.styles})){
 const bytes=await readFile(resolve(root,'vendor/foundation',name));
 if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error(`Vendor hash mismatch: ${name}`);
}
const visited=new Set();
async function inspect(path){
 path=resolve(path);if(visited.has(path))return;visited.add(path);
 const source=await readFile(path,'utf8');
 if(extname(path)==='.js')execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 const refs=extname(path)==='.html'?[...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]):extname(path)==='.css'?[...source.matchAll(/(?:url\(\s*|@import\s+)["']?([^"'\s)]+)["']?\)?/g)].map(m=>m[1]):[...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map(m=>m[1]);
 for(const ref of refs){if(!ref||/^(?:https?:|data:|#)/.test(ref))continue;const next=resolve(dirname(path),ref.split(/[?#]/)[0]);await stat(next);if(['.js','.css','.html'].includes(extname(next)))await inspect(next);}
}
await inspect(resolve(root,'index.html'));await inspect(resolve(root,'components.html'));
console.log(`Passed: 8 pages, 33 samples, branding cleanup, module/CSS hashes and ${visited.size} linked files.`);
