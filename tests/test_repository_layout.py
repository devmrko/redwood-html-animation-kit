"""Verify the actual exported workspace, not just the source-tree allowlist."""
import functools
import http.client
import http.server
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from framework.python.presentation_authoring import create_authoring_bundle
from start import PresentationHandler


class LayoutTest(unittest.TestCase):
 def test_exported_workspace_contains_complete_runtime_and_no_development_tools(self):
  project=json.loads((ROOT/'examples/presentation-project.json').read_text())
  with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT,project))) as archive,tempfile.TemporaryDirectory() as directory:
   names=archive.namelist()
   for required in ('app/deck.html','app/deck.js','app/legacy-routes.json','examples/animations/index.html','examples/animations/samples.html','examples/components/index.html','examples/components/standalone.html','scripts/check.mjs'):
    self.assertIn(required,names)
   self.assertFalse(any(name.startswith(('tests/','examples/usage-demo/','templates/legacy/')) for name in names))
   for excluded in ('scripts/build_usage_demo.py','scripts/smoke_visual_scenarios.py','scripts/browser-smoke.mjs','.env','ai-session.js'):
    self.assertNotIn(excluded,names)
   aliases=json.loads(archive.read('app/legacy-routes.json'));self.assertTrue(aliases)
   self.assertTrue(all(value.lstrip('/') in names for value in aliases.values()))
   package=json.loads(archive.read('package.json'))
   self.assertEqual(set(package['scripts']),{'start','check','build:framework'})
   archive.extractall(directory)
   result=subprocess.run(['node','scripts/check.mjs'],cwd=directory,capture_output=True,text=True,timeout=30)
   self.assertEqual(result.returncode,0,result.stderr[-2500:])

 def test_legacy_http_links_redirect_with_queries_and_canonical_pages_are_complete(self):
  class Quiet(PresentationHandler):
   def log_message(self,*args):pass
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   connection=http.client.HTTPConnection('127.0.0.1',server.server_port)
   connection.request('GET','/deck.html?project=example&slide=first')
   response=connection.getresponse();response.read()
   self.assertEqual(response.status,302)
   self.assertEqual(response.getheader('Location'),'/app/deck.html?project=example&slide=first')
   connection.request('GET','/app/deck.html');response=connection.getresponse();markup=response.read().decode()
   self.assertEqual(response.status,200);self.assertIn('<base href="../">',markup)
   self.assertIn('src="./app/deck.js"',markup)
   connection.close()
  finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
