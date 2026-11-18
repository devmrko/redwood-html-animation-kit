"""File import, portable bundles and browser range delivery share one manifest."""
import copy
import functools
import http.client
import http.server
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import zipfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
from import_media import import_media
from framework.python.presentation_media import validate_media,verify_media_files
from framework.python.presentation_authoring import create_authoring_bundle
from framework.python.presentation_release import create_release_bundle
from framework.python.presentation_projects import TemporaryPresentationProjects
from start import PresentationHandler

class Quiet(PresentationHandler):
    def log_message(self,*args):pass

class MediaTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        p=json.loads((ROOT/'examples/presentation-project.json').read_text())
        with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT,p))) as archive:archive.extractall(self.root)
        self.clip=self.root/'fixture.mp4';self.clip.write_bytes(b'\0\0\0\x18ftypisom'+b'\0'*52)
        import_media(self.root,slide_id='process',file=self.clip,start=1,end=5,at=2)
        self.project=json.loads((self.root/'presentation-project.json').read_text());self.media=self.project['media'][0]
    def tearDown(self):self.temp.cleanup()
    def test_import_manifest_portable_release_and_tamper_detection(self):
        self.assertEqual(len(verify_media_files(self.root,[self.media])),1)
        manifest=self.root/'presentation-release.json';m=json.loads(manifest.read_text());m['status']='ready';manifest.write_text(json.dumps(m))
        output=create_release_bundle(self.root,self.root/'out.zip')
        with zipfile.ZipFile(output) as z:
            self.assertEqual(z.read(self.media['path']),self.clip.read_bytes());self.assertEqual(json.loads(z.read('presentation-project.json'))['media'],[self.media])
        (self.root/self.media['path']).write_bytes(b'bad')
        with self.assertRaises(ValueError):verify_media_files(self.root,[self.media])
    def test_invalid_clip_and_youtube_cannot_modify_project(self):
        invalid=copy.deepcopy(self.project);invalid['document']['slides'][2]['mediaLayout']='invalid'
        from framework.python.presentation_authoring import validate_authoring_project
        with self.assertRaises(ValueError):validate_authoring_project(invalid)
        original=(self.root/'presentation-project.json').read_bytes()
        for options in [dict(end=0,file=self.clip),dict(end=700,file=self.clip),dict(end=5,youtube='https://evil.test/watch?v=dQw4w9WgXcQ')]:
            with self.assertRaises(ValueError):import_media(self.root,slide_id='process',**options)
            self.assertEqual((self.root/'presentation-project.json').read_bytes(),original)
        m=copy.deepcopy(self.media);m['path']='media/../private.mp4'
        with self.assertRaises(ValueError):validate_media([m])
    def test_range_head_unknown_and_hash_mismatch(self):
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(self.root)))
        server.projects=TemporaryPresentationProjects(self.root/'transport');thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def request(method='GET',path=None,headers=None,body=None):
            conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request(method,path or '/'+self.media['path'],body,headers or {});r=conn.getresponse();result=(r.status,dict(r.getheaders()),r.read());conn.close();return result
        try:
            status,headers,data=request(headers={'Range':'bytes=4-11'});self.assertEqual(status,206);self.assertEqual(data,b'ftypisom');self.assertEqual(headers['Content-Range'],'bytes 4-11/64')
            self.assertEqual(request(headers={'Range':'bytes=-4'})[2],b'\0'*4)
            self.assertEqual(request(headers={'Range':'bytes=1000-'})[0],416)
            status,headers,data=request('HEAD');self.assertEqual(status,200);self.assertEqual(headers['Content-Length'],'64');self.assertEqual(data,b'')
            self.assertEqual(request(path='/media/unregistered.mp4')[0],404)
            project=copy.deepcopy(self.project);project['document']['title']='원본 자동 저장 검증';origin=f'http://127.0.0.1:{server.server_port}'
            status,_,_=request('POST','/api/projects/'+project['document']['id'],{'Origin':origin,'Content-Type':'application/json'},json.dumps(project));self.assertEqual(status,200)
            self.assertEqual(json.loads((self.root/'presentation-project.json').read_text())['document']['title'],'원본 자동 저장 검증')
            (self.root/self.media['path']).write_bytes(b'X'*64);self.assertEqual(request()[0],404)
        finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
