"""Build a public, model-free release ZIP for manual offline browser checks.

The result uses the production packager. It contains no test runner or server API
dependency; serve only the extracted release when checking the embedded runtime.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
from framework.python.presentation_authoring import create_authoring_bundle
from framework.python.presentation_release import create_release_bundle
from import_evidence import import_evidence
from import_media import import_media


def build(output, *, export_review=False):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    project = json.loads((ROOT / 'examples/presentation-project.json').read_text())
    project['document'].update(title='배포본 검증', presenter='공개 검증 자료')
    project['document']['slides'][0]['title'] = '배포본 검증'
    project['assets'] = [{
        'id': 'photo', 'name': '공개 템플릿 이미지', 'type': 'image/jpeg',
        'dataUrl': 'data:image/jpeg;base64,' + base64.b64encode((ROOT / 'assets/redwood-cover.jpeg').read_bytes()).decode(),
    }]
    project['document']['slides'][2].update(imageId='photo', imageAlt='공개 템플릿 이미지')
    project['document']['slides'][3].update(appearance='dark', title='표와 영상을 함께 확인합니다', mediaLayout='balanced', notes='어두운 테마의 표와 3초 합성 영상이 표시됩니다. 발표자 창에서 재생과 일시정지를 조작합니다.')
    if export_review:
        project['document']['slides'].insert(-1,{'id':'chart-review','layout':'content','title':'막대 차트는 30·50·20을 표시합니다','section':'내보내기 검증','items':[],'notes':'막대 차트의 값은 A가 30, B가 50, C가 20입니다.'})
        project['document']['slides'][3]['notes']='표의 실행 결과와 로컬 합성 영상을 함께 확인합니다. 이 자막은 읽기 시간을 확보하도록 길게 작성했습니다. 자막이 길어지면 장표와 애니메이션의 재생 시간도 함께 늘어나며 다음 장표는 자막 표시가 끝난 뒤 시작해야 합니다.'
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder) / 'workspace'
        root.mkdir()
        with zipfile.ZipFile(io.BytesIO(create_authoring_bundle(ROOT, project))) as archive:
            archive.extractall(root)
        # Use the normal authored-page contract, including three animation steps.
        page = root / 'pages/process.js'
        page.write_text(page.read_text().replace("draft.textContent='제작 전 초안'", "draft.textContent='사진과 세 단계 등장 효과'"))
        table = root / 'pages/compare.js'
        table.write_text("""import {createPresentationTimeline} from '../vendor/foundation/presentation-timeline.js';
export function renderPage({body,document:doc}){
 const table=doc.createElement('table');
 for(const [index,row] of [['항목','확인할 내용'],['로컬 영상','3초 영상 재생'],['발표자 보기','장표와 대본 동기화']].entries()){
  const group=doc.createElement(index?'tbody':'thead'),tr=doc.createElement('tr');
  for(const text of row){const cell=doc.createElement(index?'td':'th');cell.textContent=text;tr.append(cell);}
  group.append(tr);table.append(group);
 }
 body.append(table);
 return {player:createPresentationTimeline({duration:4000,tracks:[{element:table,keyframes:[{opacity:1},{opacity:1}]}]})};
}
""")
        if export_review:
            (root/'pages/chart-review.js').write_text("""import {createPresentationChart} from '../vendor/foundation/presentation-chart.js';
import {createPresentationTimeline} from '../vendor/foundation/presentation-timeline.js';
export function renderPage({body,document:doc}){
 const node=doc.createElement('div');node.className='rf-chart';body.append(node);
 const chart=createPresentationChart({root:node,type:'bar',title:'공개 합성 데이터',data:[{label:'A',value:30},{label:'B',value:50},{label:'C',value:20}]});
 return {player:createPresentationTimeline({duration:2000,tracks:chart.tracks})};
}
""")
        pictures = Path(folder) / 'pictures'
        pictures.mkdir()
        shutil.copyfile(ROOT / 'assets/redwood-cover.jpeg', pictures / 'public-template.jpg')
        import_evidence(root, pictures, kind='mock', source='저장소 공개 템플릿 이미지', claim='증거 확대·닫기 확인', slide_id='process')
        clip = Path(folder) / 'fixture.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', str(clip)], check=True)
        import_media(root, slide_id='compare', file=clip, end=3, title='공개 합성 영상 · 3초')
        manifest_path = root / 'presentation-release.json'
        manifest = json.loads(manifest_path.read_text())
        # This flag permits packaging only; actual browser checks remain manual.
        manifest['status'] = 'ready'
        manifest['source']['purpose'] = 'synthetic browser verification fixture'
        manifest_path.write_text(json.dumps(manifest))
        release = create_release_bundle(root, output / 'offline-review.zip')
        with zipfile.ZipFile(release) as archive:
            archive.extractall(output / 'release')
        if export_review:shutil.copytree(root,output/'workspace')
    print(output / 'release/index.html')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/offline-review')
    parser.add_argument('--export-review',action='store_true',help='Add a chart and long captions; retain the server workspace for export checks')
    args=parser.parse_args();build(args.output,export_review=args.export_review)
