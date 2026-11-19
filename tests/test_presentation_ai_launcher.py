import copy
import functools
import http.client
import http.server
import io
import json
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import zipfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from framework.python.presentation_authoring import create_authoring_bundle
from framework.python.presentation_projects import TemporaryPresentationProjects
from start import PresentationHandler

class AiGenerationPortTest(unittest.TestCase):
 def test_all_providers_are_used_for_subtitles_and_outline_with_original_validation(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'authoring').mkdir();(root/'authoring/SLIDE_PRINCIPLES.md').write_text('사실을 만들지 않는다.')
   class Quiet(PresentationHandler):
    def log_message(self,*args):pass
   server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=folder));server.projects=TemporaryPresentationProjects(root/'transfers');thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
   def request(path,payload):
    connection=http.client.HTTPConnection('127.0.0.1',server.server_port);connection.request('POST',path,json.dumps(payload),{'Origin':origin,'Content-Type':'application/json'});response=connection.getresponse();result=response.status,json.loads(response.read());connection.close();return result
   try:
    for choice in [{'provider':'openai','model':'selected-model'},{'provider':'oci','region':'us-chicago-1','model':'oci-model'},{'provider':'cli','tool':'codex'},{'provider':'cli','tool':'claude'}]:
     with self.subTest(choice=choice),patch('framework.python.presentation_ai_providers.PresentationAiProviders.generate',return_value={'captions':[{'start':0,'end':3,'text':'검토 후 저장'}]}) as generate:
      status,result=request('/api/subtitles/draft',{'connection':choice,'title':'검토','content':'검토 후 저장','notes':'검토 후 저장합니다.','events':[],'duration':4});self.assertEqual(status,200);self.assertEqual(result['captions'][0]['text'],'검토 후 저장');self.assertEqual(generate.call_args.args[0],choice);self.assertEqual(generate.call_args.kwargs['max_tokens'],1200)
     with patch('framework.python.presentation_ai_providers.PresentationAiProviders.generate',return_value={'slides':[{'layout':'content','title':'검토 후 저장','items':['검토','저장'],'notes':'검토 후 저장합니다.'}]}) as generate:
      status,result=request('/api/presentation-draft',{'connection':choice,'scenario':'검토 후 저장합니다.','title':'발표','images':[]});self.assertEqual(status,200);self.assertEqual(result['slides'][0]['title'],'검토 후 저장');self.assertEqual(generate.call_args.args[0],choice);self.assertEqual(generate.call_args.kwargs['max_tokens'],6000)
    with patch('framework.python.presentation_ai_providers.PresentationAiProviders.generate') as generate:
     status,_=request('/api/subtitles/draft',{'connection':{'provider':'cli','tool':'codex'},'duration':-1});self.assertEqual(status,400);generate.assert_not_called()
   finally:server.shutdown();server.server_close();thread.join()

class AiLauncherTest(unittest.TestCase):
 def test_packaged_mac_launcher_starts_selected_python_helper_and_cleans_session(self):
  project=json.loads((ROOT/'examples/presentation-project.json').read_text())
  with tempfile.TemporaryDirectory(prefix='presentation launcher space ') as folder:
   root=Path(folder)
   with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT,project))) as archive:
    for name in ['AI/start.command','AI/start-openai.command','AI/start-oci.command','AI/start-codex.command','AI/start-claude.command','AI/start.cmd','app/ai-start.html','app/ai-connection.js','app/offline-ai.js']:self.assertIn(name,archive.namelist())
    self.assertTrue(archive.getinfo('AI/start-codex.command').external_attr>>16&0o100)
    self.assertNotIn('ai-session.js',archive.namelist());archive.extractall(root)
   log=root/'launcher-test.log'
   with log.open('w') as stream:
    process=subprocess.Popen(['/bin/sh',str(root/'AI/start-codex.command'),'--no-browser'],stdout=stream,stderr=stream,start_new_session=True)
    try:
     session=root/'ai-session.js'
     for _ in range(80):
      if session.exists():break
      if process.poll() is not None:self.fail('Launcher stopped: '+log.read_text()[-1000:])
      time.sleep(.1)
     self.assertTrue(session.exists());value=json.loads(session.read_text().removeprefix('window.redwoodAiSession=').strip().removesuffix(';'));self.assertRegex(value['origin'],r'^http://127\.0\.0\.1:\d+$')
     for _ in range(20):
      if 'Open ' in log.read_text():break
      time.sleep(.05)
     self.assertIn('ai-provider=cli',log.read_text());self.assertIn('ai-tool=codex',log.read_text())
     from urllib.request import urlopen
     with urlopen(value['origin']+'/ai-start.html') as response:self.assertIn('AI 편집 시작',response.read().decode())
     with urlopen(value['origin']+'/api/ai/capabilities') as response:self.assertIn('cli',json.load(response))
    finally:
     process.send_signal(signal.SIGINT)
     try:process.wait(timeout=8)
     except subprocess.TimeoutExpired:process.kill();process.wait()
   self.assertFalse((root/'ai-session.js').exists())

if __name__=='__main__':unittest.main()
