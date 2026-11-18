import json
from pathlib import Path
import sys
import tempfile
import unittest
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from framework.python.presentation_offline import create_offline_html,offline_modules,embedded_json

class OfflineTest(unittest.TestCase):
 def test_data_styles_and_module_graph_are_embedded_without_server_bootstrap(self):
  project=json.loads((ROOT/'examples/presentation-project.json').read_text());project['document']['slides'][2]['notes']='문자열 </script><script>alert(1)</script> 보존'
  output=create_offline_html(ROOT,project)
  class Scripts(HTMLParser):
   def __init__(self):super().__init__();self.types=[];self.sources=[];self.current=None;self.data={}
   def handle_starttag(self,tag,attrs):
    if tag=='script':
     a=dict(attrs);self.types.append(a.get('type','classic'));self.sources.append(a.get('src'));self.current=a.get('id');self.data[self.current]=''
   def handle_endtag(self,tag):
    if tag=='script':self.current=None
   def handle_data(self,data):
    if self.current:self.data[self.current]+=data
  parser=Scripts();parser.feed(output)
  self.assertEqual(len(parser.types),3);self.assertFalse(any(parser.sources));self.assertEqual(json.loads(parser.data['offline-data'])['project'],project)
  graph=json.loads(parser.data['offline-modules']);self.assertIn('offline-entry.js',graph);self.assertIn('vendor/foundation/presentation-document-view.js',graph)
  self.assertNotIn('@import',output);self.assertNotIn('indexedDB',graph['offline-entry.js']['source']);self.assertNotIn('/api/',graph['offline-entry.js']['source'])
  self.assertIn('offline-speaker',output);self.assertIn('offline-evidence',output)
 def test_module_graph_rejects_escape_remote_imports_and_cycles(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'a.js').write_text("import './b.js';");(root/'b.js').write_text("import './a.js';")
   for entry in ["import '../private.js';","import 'https://example.com/script.js';","import './a.js';"]:
    with self.assertRaises(ValueError):offline_modules(root,entry)
 def test_module_graph_preserves_local_modules_and_has_no_script_terminator(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'child.js').write_text('export const example="</script>";')
   graph=offline_modules(root,"import {example} from './child.js';")
   self.assertEqual(graph['offline-entry.js']['refs']['./child.js'],'child.js');self.assertNotIn('</script>',embedded_json(graph));self.assertEqual(json.loads(embedded_json(graph)),graph)

if __name__=='__main__':unittest.main()
