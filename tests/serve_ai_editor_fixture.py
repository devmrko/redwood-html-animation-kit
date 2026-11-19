"""Local real-editor QA with deterministic model responses and disposable Git data.

No external model, credential or user's presentation is used.
"""
import argparse
import base64
import copy
import functools
import http.server
import json
import os
import socket
from pathlib import Path
import struct
import sys
import tempfile
import time
import uuid
import zlib

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from start import PresentationHandler
from framework.python.presentation_ai import PresentationAiWorkspace
from framework.python.presentation_projects import TemporaryPresentationProjects


def png():
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1280,720,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes([32,80,100])*1280)*720))+chunk(b'IEND',b'')
    return 'data:image/png;base64,'+base64.b64encode(data).decode()


class FixtureProviders:
    def __init__(self,mode):self.mode=mode
    def capabilities(self):
        return {'openai':{'available':True,'model':'synthetic-fixture'},'oci':{'available':False,'profiles':[],'regions':{},'profile':'','region':'','model':'','compartment':''},'cli':{'available':False,'tools':[]}}
    def generate(self,connection,system,context):
        if self.mode=='generation-failure':raise RuntimeError('검증용 생성 실패 · 외부 모델 호출 없음')
        return {'summary':'합성 검증 · 제목 한 개 변경','changes':{'title':'검증된 변경 제목'},'page':None}


class FixtureWorkspace(PresentationAiWorkspace):
    def __init__(self,root,mode):
        super().__init__(root);self.providers=FixtureProviders(mode);self.mode=mode;self.apply_calls=0
    def apply(self,project_id,payload):
        self.apply_calls+=1
        if self.mode=='stale-source':
            path=self.root/'presentation-project.json';project=json.loads(path.read_text());project['document']['slides'][2]['notes']='외부에서 변경한 대본 · 덮어쓰면 안 됩니다.';path.write_text(json.dumps(project,ensure_ascii=False))
            stamp=(self.repo(project_id)/'snapshot.json').stat().st_mtime_ns+1000000;os.utime(path,ns=(stamp,stamp))
        if self.mode=='write-delay':time.sleep(2)
        return super().apply(project_id,payload)


class Handler(PresentationHandler):
    def log_message(self,*args):pass
    def json_response(self,payload,status=200):
        mode=getattr(getattr(self.server,'ai_workspace',None),'mode','')
        endpoint='/propose' if mode=='generation-disconnect' else '/apply' if mode=='apply-disconnect' else None
        if endpoint and self.path.endswith(endpoint) and status==200:
            # Drop only the response, after the real workspace operation. This
            # reproduces an uncertain result without killing unrelated requests.
            self.close_connection=True
            try:self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:pass
            self.connection.close();return
        super().json_response(payload,status)
    def do_GET(self):
        if self.path=='/fixture/png':self.json_response({'image':png()});return
        if self.path=='/fixture/report':
            ws=self.server.ai_workspace;project=self.server.fixture_project;identifier=project['document']['id'];snapshot=ws.read(identifier)
            self.json_response({'applyRequests':ws.apply_calls,'versions':len(ws.history(identifier)['versions']),'pendingProposals':len(ws.proposals),'title':snapshot['project']['document']['slides'][2]['title'] if snapshot else project['document']['slides'][2]['title'],'notes':snapshot['project']['document']['slides'][2]['notes'] if snapshot else project['document']['slides'][2]['notes']});return
        super().do_GET()
    def do_POST(self):
        if self.path=='/fixture/config':
            if self.headers.get('Origin')!=f'http://127.0.0.1:{self.server.server_port}':self.send_error(403);return
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<1000:self.send_error(400);return
            payload=json.loads(self.rfile.read(length));mode=payload.get('mode')
            if mode not in ('normal','capture-delay','stale-source','generation-failure','write-delay','baseline-source','generation-disconnect','apply-disconnect'):self.send_error(400);return
            project=json.loads((ROOT/'examples/presentation-project.json').read_text());project['document']['id']=str(uuid.uuid4())
            root=self.server.fixture_root/project['document']['id'];(root/'authoring').mkdir(parents=True)
            (root/'authoring/SLIDE_PRINCIPLES.md').write_text((ROOT/'authoring/SLIDE_PRINCIPLES.md').read_text())
            source=copy.deepcopy(project)
            if mode=='baseline-source':source['document']['slides'][2]['title']='편집 시작 전 외부에서 수정한 제목'
            (root/'presentation-project.json').write_text(json.dumps(source,ensure_ascii=False))
            self.server.ai_workspace=FixtureWorkspace(root,mode);self.server.fixture_project=copy.deepcopy(project)
            self.json_response({'project':project});return
        super().do_POST()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=0);args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='redwood-ai-review-') as folder:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Handler,directory=str(ROOT)))
        server.fixture_root=Path(folder);server.projects=TemporaryPresentationProjects(Path(folder)/'transfers')
        print(f'Open http://127.0.0.1:{server.server_port}/tests/browser/ai-editor.html',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
        finally:server.server_close()
