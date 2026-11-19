import {test} from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,validateMedia} from '../vendor/foundation/presentation-media.js';
import {validatePresentationProject} from '../vendor/foundation/presentation-document.js';
import {readFileSync} from 'node:fs';
const clip={id:'clip',title:'시연',kind:'file',path:'media/demo.mp4',type:'video/mp4',bytes:32,sha256:'a'.repeat(64),start:3,end:9,at:2,muted:true};
test('video clips reject unsafe paths and invalid or excessive intervals',()=>{
 assert.equal(validateMedia([clip])[0].end,9);
 for(const invalid of [{path:'media/../private.mp4'},{path:'https://host.test/a.mp4'},{end:3},{start:NaN},{end:604},{muted:'yes'},{bytes:104857601}])assert.throws(()=>validateMedia([{...clip,...invalid}]));
});
test('YouTube links resolve only recognized HTTPS video URLs',()=>{
 const id='dQw4w9WgXcQ';for(const link of [id,'https://youtu.be/'+id,'https://www.youtube.com/watch?v='+id,'https://www.youtube.com/embed/'+id])assert.equal(youtubeVideoId(link),id);
 for(const link of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v='+id,'http://youtu.be/'+id,'https://user@youtu.be/'+id])assert.throws(()=>youtubeVideoId(link));
});
test('project JSON roundtrips video references and rejects missing or duplicate IDs',()=>{
 const p=JSON.parse(readFileSync(new URL('../examples/presentation-project.json',import.meta.url)));p.media=[clip];p.document.slides[2].mediaIds=['clip'];p.document.slides[2].mediaLayout='focus';
 assert.deepEqual(validatePresentationProject(p).media,[clip]);assert.equal(validatePresentationProject(p).document.slides[2].mediaLayout,'focus');
 p.document.slides[2].mediaLayout='unsupported';assert.throws(()=>validatePresentationProject(p));p.document.slides[2].mediaLayout='balanced';
 p.document.slides[2].mediaIds=['missing'];assert.throws(()=>validatePresentationProject(p));
 p.document.slides[2].mediaIds=['clip','clip'];assert.throws(()=>validatePresentationProject(p));
});
