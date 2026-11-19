"""Real HTTP response loss around proposal/apply, using disposable Git state."""
import functools
import http.client
import http.server
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'tests'))
from serve_ai_editor_fixture import Handler
from framework.python.presentation_projects import TemporaryPresentationProjects


class AiDisconnectTest(unittest.TestCase):
 def test_lost_proposal_and_apply_responses_can_be_reconciled_without_replaying_write(self):
  with tempfile.TemporaryDirectory() as folder:
   server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
   server.fixture_root=Path(folder);server.projects=TemporaryPresentationProjects(Path(folder)/'transfers')
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   def request(path,payload=None):
    connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=10)
    try:
     connection.request('POST' if payload is not None else 'GET',path,json.dumps(payload) if payload is not None else None,{'Origin':f'http://127.0.0.1:{server.server_port}','Content-Type':'application/json'})
     response=connection.getresponse();value=json.loads(response.read());self.assertEqual(response.status,200,value);return value
    finally:connection.close()
   try:
    for mode in ('generation-disconnect','apply-disconnect'):
     with self.subTest(mode=mode):
      project=request('/fixture/config',{'mode':mode})['project'];identifier=project['document']['id'];path='/api/ai/projects/'+identifier+'/'
      baseline=request(path+'init',{'project':project});payload={'base':baseline['head'],'slideId':'process','request':'Update title','connection':{'provider':'openai'}}
      if mode=='generation-disconnect':
       with self.assertRaises(http.client.RemoteDisconnected):request(path+'propose',payload)
       current=request(path+'state');self.assertEqual(current,baseline);self.assertEqual(len(request(path+'history')['versions']),1)
      else:
       proposal=request(path+'propose',payload)
       with self.assertRaises(http.client.RemoteDisconnected):request(path+'apply',{'token':proposal['token']})
       current=request(path+'state');self.assertNotEqual(current['head'],baseline['head']);self.assertEqual(current['snapshot'],proposal['snapshot']);self.assertEqual(len(request(path+'history')['versions']),2)
       self.assertEqual(server.ai_workspace.apply_calls,1)
       restored=request(path+'restore',{'base':current['head'],'revision':baseline['head']})
       self.assertEqual(request(path+'state')['snapshot'],baseline['snapshot']);self.assertEqual(len(request(path+'history')['versions']),3)
   finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
