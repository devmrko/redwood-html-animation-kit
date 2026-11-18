import copy
import io
import zipfile
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from framework.python.presentation_ai import PresentationAiWorkspace,RevisionConflict
from framework.python.presentation_ai_markup import validate_page
from framework.python.presentation_ai_providers import PresentationAiProviders,parse_json
from framework.python.presentation_export import load_settings

PAGE={'html':'<div class="item" style="display:flex;gap:30px;color:var(--rf-text)"><p>검토 후 보관</p><svg viewBox="0 0 200 100"><rect x="0" y="0" width="100" height="40" fill="var(--rf-accent)"/></svg></div>','duration':8,'effects':[{'selector':'.item','at':.5,'duration':.6,'type':'fade'}]}

class AiWorkspaceTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'authoring').mkdir();(self.root/'authoring/SLIDE_PRINCIPLES.md').write_text('사실을 만들지 않는다.')
  self.project=json.loads((ROOT/'examples/presentation-project.json').read_text());self.id=self.project['document']['id'];self.slide=self.project['document']['slides'][2]['id'];self.ws=PresentationAiWorkspace(self.root);self.base=self.ws.ensure(self.project)
 def tearDown(self):self.temp.cleanup()
 def propose(self,**kwargs):
  result={'summary':'제목과 본문 도식 변경','changes':{'title':'검토 후 자료를 보관합니다'},'page':PAGE}|kwargs
  with patch.object(self.ws.providers,'generate',return_value=result):return self.ws.propose(self.id,{'base':self.ws.head(self.id),'slideId':self.slide,'request':'검토 흐름 도식으로 바꿔 주세요.','connection':{'provider':'openai'}})
 def test_proposal_is_not_applied_until_apply_and_restores_as_a_new_commit(self):
  proposal=self.propose();self.assertEqual(self.ws.head(self.id),self.base);self.assertEqual(self.ws.read(self.id)['project'],self.project)
  applied=self.ws.apply(self.id,{'token':proposal['token']});self.assertNotEqual(applied['revision'],self.base)
  current=self.ws.read(self.id);self.assertIn(self.slide,current['pages']);self.assertTrue(current['project']['document']['slides'][2]['authored'])
  restored=self.ws.restore(self.id,{'base':applied['revision'],'revision':self.base});self.assertNotEqual(restored['revision'],self.base);self.assertEqual(self.ws.read(self.id)['project'],self.project);self.assertEqual(len(self.ws.history(self.id)['versions']),3)
  with self.assertRaises(ValueError):self.ws.apply(self.id,{'token':proposal['token']})
 def test_concurrent_or_stale_proposals_and_manual_saves_are_rejected(self):
  a=self.propose();b=self.propose();self.ws.apply(self.id,{'token':a['token']})
  with self.assertRaises(RevisionConflict):self.ws.apply(self.id,{'token':b['token']})
  with self.assertRaises(RevisionConflict):self.ws.update_project(self.project,self.base)
  with self.assertRaises(RevisionConflict):self.ws.ensure(self.project)
 def test_restart_recovers_head_and_original_and_does_not_copy_env(self):
  (self.root/'.env').write_text('OPENAI_API_KEY=SECRET')
  proposal=self.propose();self.ws.apply(self.id,{'token':proposal['token']});other=PresentationAiWorkspace(self.root)
  self.assertEqual(other.head(self.id),self.ws.head(self.id));self.assertEqual(other.read(self.id,self.base)['project'],self.project)
  self.assertNotIn('SECRET',json.dumps(other.read(self.id)))
 def test_ai_cannot_modify_other_slides_or_execute_markup(self):
  for changes in ({'id':'evil'},{'layout':'cover'},{'title':''},{'imageId':'missing'}):
   with self.assertRaises(ValueError):self.propose(changes=changes)
  with self.assertRaises(ValueError):self.propose(page={**PAGE,'html':'<script>fetch("/.env")</script>'})
  self.assertEqual(self.ws.head(self.id),self.base)
 def test_projection_is_portable_for_source_workspace(self):
  (self.root/'presentation-project.json').write_text(json.dumps(self.project));p=self.propose();self.ws.apply(self.id,{'token':p['token']})
  self.assertIn(self.slide,json.loads((self.root/'presentation-ai-pages.json').read_text())['pages'])
  self.assertEqual(json.loads((self.root/'presentation-project.json').read_text())['document']['slides'][2]['title'],'검토 후 자료를 보관합니다')
 def test_external_json_edits_are_captured_on_reload(self):
  source=self.root/'presentation-project.json';source.write_text(json.dumps(self.project));self.ws.project_files(self.ws.read(self.id))
  edited=copy.deepcopy(self.project);edited['document']['slides'][2]['title']='파일에서 수정한 제목';source.write_text(json.dumps(edited))
  self.assertEqual(self.ws.current(self.id)['project'],edited);self.assertNotEqual(self.ws.head(self.id),self.base)
 def test_archive_contains_portable_pages_and_omits_history_and_keys(self):
  (self.root/'authoring/page-template.js').write_text((ROOT/'authoring/page-template.js').read_text())
  p=self.propose();self.ws.apply(self.id,{'token':p['token']});(self.root/'.env').write_text('OPENAI_API_KEY=SECRET')
  with patch('framework.python.presentation_offline.create_offline_html',return_value='<!doctype html><title>Offline</title>'),zipfile.ZipFile(io.BytesIO(self.ws.archive(self.id))) as archive:
   self.assertIn(self.slide,json.loads(archive.read('presentation-ai-pages.json'))['pages']);self.assertNotIn('.env',archive.namelist())
   self.assertFalse(any('.git' in name for name in archive.namelist()));self.assertNotIn('SECRET',archive.read('presentation-project.json').decode())

 def test_http_ai_requires_same_origin_and_stale_manual_save_is_rejected(self):
  import functools,http.client,http.server,threading
  from start import PresentationHandler
  from framework.python.presentation_projects import TemporaryPresentationProjects
  class Quiet(PresentationHandler):
   def log_message(self,*args):pass
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(self.root)));server.ai_workspace=self.ws;server.projects=TemporaryPresentationProjects(self.root/'transfers')
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
  def request(method,path,body=None,headers=None):
   c=http.client.HTTPConnection('127.0.0.1',server.server_port);c.request(method,path,json.dumps(body) if body else None,headers or {});r=c.getresponse();data=r.read();result=(r.status,data,dict(r.getheaders()));c.close();return result
  try:
   path='/api/ai/projects/'+self.id+'/propose';self.assertEqual(request('POST',path,{'request':'x'},{'Origin':'https://other.example'})[0],403)
   status,body,headers=request('GET','/api/projects/'+self.id);self.assertEqual(status,200);self.assertEqual(headers['ETag'],self.base)
   changed=copy.deepcopy(self.project);changed['document']['title']='브라우저에서 변경'
   self.assertEqual(request('POST','/api/projects/'+self.id,changed,{'Origin':origin,'Content-Type':'application/json'})[0],409)
   self.assertEqual(request('POST','/api/projects/'+self.id,changed,{'Origin':origin,'Content-Type':'application/json','If-Match':self.base})[0],200)
   self.assertEqual(self.ws.read(self.id)['project']['document']['title'],'브라우저에서 변경')
   self.assertEqual(request('GET','/.presentation-ai/'+self.id+'/snapshot.json')[0],403)
  finally:server.shutdown();server.server_close();thread.join()

 def test_git_failure_keeps_committed_state(self):
  p=self.propose();original=self.ws.git
  def fail(pid,*args,**kw):
   if args[0]=='commit':raise RuntimeError('write failed')
   return original(pid,*args,**kw)
  with patch.object(self.ws,'git',side_effect=fail):
   with self.assertRaises(RuntimeError):self.ws.apply(self.id,{'token':p['token']})
  self.assertEqual(self.ws.head(self.id),self.base);self.assertEqual(self.ws.read(self.id)['project'],self.project)

class AiMarkupTest(unittest.TestCase):
 def test_tables_svg_photos_and_motion_are_validated(self):
  self.assertIn('<svg',validate_page(PAGE,set())['html'])
  self.assertNotIn('font-family',validate_page({**PAGE,'html':'<p style="font-family:Arial;font-size:28px">본문</p>'},set())['html'])
  value=validate_page({**PAGE,'html':'<table><tr><td>성공</td></tr></table><img data-asset-id="photo" alt="증거">'},{'photo'});self.assertIn('data-asset-id',value['html'])
 def test_script_css_network_event_handlers_and_broken_timeline_rejected(self):
  for html in ['<img src="https://example.com/a.png">','<p onclick="alert(1)">x</p>','<iframe></iframe>','<p style="background:url(https://example.com)">x</p>','<p style="position:fixed">x</p>','<svg><foreignObject>x</foreignObject></svg>','<p><div>x</p></div>']:
   with self.subTest(html=html),self.assertRaises(ValueError):validate_page({**PAGE,'html':html},set())
  with self.assertRaises(ValueError):validate_page({**PAGE,'effects':[{'selector':'body','at':0,'duration':9,'type':'fade'}]},set())

class ProvidersTest(unittest.TestCase):
 def test_existing_openai_env_config_is_reused_without_returning_key(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'.env').write_text('OPENAI_API_KEY=secret\nOPENAI_MODEL=cheap\n');provider=PresentationAiProviders(root)
   with patch.dict('os.environ',{},clear=True),patch('framework.python.presentation_ai_providers.shutil.which',return_value=None):
    caps=provider.capabilities();self.assertTrue(caps['openai']['available']);self.assertNotIn('secret',json.dumps(caps))
    with patch('framework.python.presentation_ai_providers.request_presentation_json',return_value={'ok':True}) as call:
     self.assertEqual(provider.generate({'provider':'openai','model':'other'},'system',{}),{'ok':True});self.assertEqual(call.call_args.args[0]['model'],'other')
 def test_cli_uses_empty_folder_stdin_and_no_shell(self):
  with tempfile.TemporaryDirectory() as folder:
   provider=PresentationAiProviders(folder)
   def run(command,**kwargs):
    self.assertNotEqual(Path(kwargs['cwd']),Path(folder));self.assertIn('instruction',kwargs['input'])
    if 'exec' in command:
     self.assertIn('read-only',command);Path(command[command.index('--output-last-message')+1]).write_text('{"ok":true}');return ''
    self.assertIn('--tools',command);self.assertEqual(command[command.index('--tools')+1],'');return '{"result":"{\\"ok\\":true}"}'
   with patch('framework.python.presentation_ai_providers.shutil.which',side_effect=lambda n:'/bin/'+n),patch('framework.python.presentation_ai_providers.cli_run',side_effect=run):
    for tool in ('codex','claude'):self.assertEqual(provider.generate({'provider':'cli','tool':tool},'instruction',{}),{'ok':True})
 def test_oci_generic_and_cohere_payload_and_region_model_profile(self):
  with tempfile.TemporaryDirectory() as folder:
   provider=PresentationAiProviders(folder)
   def run(command,**kwargs):
    self.assertEqual(command[command.index('--region')+1],'us-chicago-1');self.assertEqual(command[command.index('--profile')+1],'DEFAULT')
    data=json.loads(Path(command[command.index('--from-json')+1][7:]).read_text());self.assertEqual(data['servingMode']['modelId'],'test-model')
    if data['chatRequest']['apiFormat']=='COHERE':response={'text':'{"ok":true}'}
    else:response={'choices':[{'message':{'content':[{'type':'TEXT','text':'{"ok":true}'}]}}]}
    return json.dumps({'data':{'chat-response':response}})
   with patch('framework.python.presentation_ai_providers.shutil.which',return_value='/bin/oci'),patch('framework.python.presentation_ai_providers.cli_run',side_effect=run):
    for api in ('GENERIC','COHERE'):self.assertEqual(provider.generate({'provider':'oci','model':'test-model','region':'us-chicago-1','compartment':'ocid1.compartment.oc1..example','apiFormat':api},'system',{}),{'ok':True})
   with self.assertRaises(ValueError):provider.generate({'provider':'cli','tool':'sh'},'',{})
 def test_malformed_json_and_model_rejected(self):
  for value in ['not-json','[]','```json\n{broken}\n```']:
   with self.assertRaises(RuntimeError):parse_json(value)
  with self.assertRaises(ValueError):PresentationAiProviders(ROOT).generate({'provider':'openai','model':123},'',{})

if __name__=='__main__':unittest.main()
