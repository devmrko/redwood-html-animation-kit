import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
from framework.python.presentation_authoring import create_authoring_bundle,validate_authoring_project
from framework.python.presentation_structure import verify_evidence_files
from framework.python.presentation_release import create_release_bundle
from import_evidence import import_evidence


class StructureAndReleaseTest(unittest.TestCase):
    def project(self):return json.loads((ROOT/'examples/presentation-project.json').read_text())

    def test_roles_data_and_parent_cycles_are_validated(self):
        p=self.project();p['document'].update(purpose='교육',audience='담당자',decision='양식 사용');s=p['document']['slides'];s[2].update(parentId=s[1]['id'],role='detail',data={'amount':10,'columns':['설명']},message='양식으로 등록')
        self.assertIs(validate_authoring_project(p),p)
        s[1]['parentId']=s[2]['id']
        with self.assertRaisesRegex(ValueError,'순환'):validate_authoring_project(p)
        s[1].pop('parentId');s[2]['data']={'unsafe':float('inf')}
        with self.assertRaises(ValueError):validate_authoring_project(p)

    def workspace(self,folder):
        with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT,self.project()))) as archive:archive.extractall(folder)
        p=Path(folder)/'presentation-release.json';manifest=json.loads(p.read_text());manifest['status']='ready';p.write_text(json.dumps(manifest))

    def test_31_evidence_files_import_and_release_keep_code_json_and_provenance(self):
        with tempfile.TemporaryDirectory() as folder,tempfile.TemporaryDirectory() as images:
            self.workspace(folder);root=Path(folder);input_dir=Path(images)
            source=(ROOT/'assets/redwood-cover.jpeg').read_bytes()
            for i in range(31):(input_dir/f'demo-{i}.jpg').write_bytes(source)
            self.assertEqual(import_evidence(root,input_dir,kind='mock',source='합성 검증 자료',claim='31개 파일 보존',slide_id='process'),31)
            project=json.loads((root/'presentation-project.json').read_text());self.assertEqual(len(verify_evidence_files(root,project['evidence'])),31)
            code=(root/'pages/process.js').read_text().replace('제작 전 초안','코드 보존 검증');(root/'pages/process.js').write_text(code)
            (root/'.env').write_text('OPENAI_API_KEY=DO-NOT-EXPORT')
            output=create_release_bundle(root,root/'release.zip')
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.read('pages/process.js').decode(),code)
                self.assertNotIn('.env',archive.namelist());self.assertEqual(sum(n.startswith('evidence/') for n in archive.namelist()),31)
                self.assertEqual(json.loads(archive.read('presentation-project.json'))['evidence'],project['evidence'])
                provenance=json.loads(archive.read('release-provenance.json'));self.assertEqual(provenance['files']['pages/process.js'],hashlib.sha256(code.encode()).hexdigest())
            evidence=root/project['evidence'][0]['path'];evidence.write_bytes(b'tampered')
            with self.assertRaises(ValueError):create_release_bundle(root,root/'bad.zip')

    def test_release_rejects_missing_dependencies_private_paths_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            self.workspace(folder);root=Path(folder);p=root/'presentation-release.json';original=json.loads(p.read_text())
            code=root/'pages/process.js';code.write_text("import './missing.js'; export const renderPage=()=>{};")
            with self.assertRaisesRegex(ValueError,'의존'):create_release_bundle(root,root/'out.zip')
            for name in ['../private.js','.env','pages/../../private.js']:
                manifest=copy.deepcopy(original);manifest['files'].append(name);p.write_text(json.dumps(manifest))
                with self.assertRaises(ValueError):create_release_bundle(root,root/'out.zip')
            (root/'pages/linked.js').symlink_to(root/'start.py');manifest=copy.deepcopy(original);manifest['files'].append('pages/linked.js');p.write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):create_release_bundle(root,root/'out.zip')

    def test_evidence_path_and_symlink_cannot_read_outside_workspace(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'evidence').mkdir();(root/'evidence/linked.png').symlink_to(ROOT/'.env')
            e={'id':'e','title':'test','path':'evidence/linked.png','type':'image/png','bytes':100,'sha256':'a'*64,'kind':'mock','source':'fixture'}
            with self.assertRaises(ValueError):verify_evidence_files(root,[e])


if __name__=='__main__':unittest.main()
