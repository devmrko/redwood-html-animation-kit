import { cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await cp(new URL('../framework/ui/', import.meta.url), new URL('../vendor/foundation/ui/', import.meta.url), { recursive: true });
const base = new URL('../vendor/foundation/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
for (const name of await readdir(base)) {
  if (name.endsWith('.js')) manifest.modules[name] = createHash('sha256').update(await readFile(new URL(name, base))).digest('hex');
}
for (const name of ['ui.css','tokens.css','components.css']) manifest.styles[`ui/${name}`] = createHash('sha256').update(await readFile(new URL(`ui/${name}`,base))).digest('hex');
manifest.status = 'rebuilt from the bundled presentation source; upstream tarball is retained as provenance';
manifest.browser_source = 'framework/src';
await writeFile(new URL('manifest.json',base), JSON.stringify(manifest,null,2)+'\n');
