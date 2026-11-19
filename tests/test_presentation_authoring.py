import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from framework.python.presentation_authoring import create_authoring_bundle,validate_authoring_project


class AuthoringBundleTest(unittest.TestCase):
    def project(self):
        value=json.loads((ROOT/'examples/presentation-project.json').read_text())
        value['document']['brief']='비교는 표, 절차는 SVG 도식으로 제작'
        value['document']['slides'][2]['design']='등록·검토·보관을 가로로 연결'
        return value

    def test_workspace_has_instructions_metadata_template_and_registered_local_modules(self):
        project=self.project();project['document']['appearance']='dark';project['document']['slides'][0]['appearance']='light'
        with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT,project))) as archive:
            for name in ('examples/animations/samples.html','examples/components/standalone.html','AGENTS.md','CLAUDE.md','AUTHORING.md','SLIDE_PRINCIPLES.md','REQUEST.md','presentation-project.json','start.py','app/deck.js','authored-pages.js','pages/process.js','pages/compare.js','assets/oracle-wordmark.svg','templates/oracle-corporate.css','assets/oracle-corporate/badge.svg','vendor/pptxgenjs/pptxgen.bundle.js','vendor/pptxgenjs/JSZIP-LICENSE.txt','vendor/html-to-image/html-to-image.js','framework/src/presentation-document-view.ts'):
                self.assertIn(name,archive.namelist())
            exported=json.loads(archive.read('presentation-project.json'))
            self.assertEqual(exported['document']['brief'],project['document']['brief'])
            self.assertEqual(exported['document']['appearance'],'dark')
            self.assertEqual(exported['document']['slides'][0]['appearance'],'light')
            self.assertTrue(exported['document']['slides'][2]['authored'])
            self.assertEqual(exported['document']['slides'][2]['layout'],'content')
            self.assertIn('등록·검토·보관을 가로로 연결',archive.read('REQUEST.md').decode())
            self.assertIn("'./pages/process.js'",archive.read('authored-pages.js').decode())
            self.assertIn('createPresentationTimeline',archive.read('pages/process.js').decode())
            for guide in ('AGENTS.md','CLAUDE.md','AUTHORING.md','REQUEST.md'):
                self.assertIn('SLIDE_PRINCIPLES.md',archive.read(guide).decode())
        self.assertNotIn('authored',project['document']['slides'][2])

    def test_private_runtime_files_env_and_other_projects_are_never_copied(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'authoring').mkdir();(root/'assets').mkdir();(root/'vendor').mkdir()
            (root/'authoring/page-template.js').write_text('export const renderPage=()=>{};')
            (root/'.env').write_text('OPENAI_API_KEY=PRIVATE-CREDENTIAL')
            (root/'assets/private.jpg').write_bytes(b'PRIVATE-PHOTO')
            (root/'presentation-project.json').write_text('OTHER-PROJECT')
            (root/'vendor/.env').write_text('PRIVATE-CREDENTIAL')
            (root/'vendor/private.js').symlink_to(root/'.env')
            with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(root,self.project()))) as archive:
                self.assertFalse(any(Path(name).name=='.env' for name in archive.namelist()))
                self.assertNotIn('assets/private.jpg',archive.namelist())
                self.assertNotIn('vendor/private.js',archive.namelist())
                self.assertFalse(any(b'PRIVATE-CREDENTIAL' in archive.read(name) for name in archive.namelist()))

    def test_invalid_ids_and_photo_sources_cannot_become_workspace_paths(self):
        for value in ('../escape','x/../../escape','x\nimport "evil"'):
            project=self.project();project['document']['slides'][2]['id']=value
            with self.assertRaises(ValueError):create_authoring_bundle(ROOT,project)
        project=self.project();project['assets']=[{'id':'photo-1','type':'image/png','dataUrl':'https://example.test/photo.png'}]
        with self.assertRaises(ValueError):validate_authoring_project(project)

    def test_authored_code_is_not_silently_replaced_by_a_starter(self):
        project=self.project();project['document']['slides'][2]['authored']=True
        with self.assertRaisesRegex(ValueError,'폴더 전체'):create_authoring_bundle(ROOT,project)


if __name__=='__main__':unittest.main()
