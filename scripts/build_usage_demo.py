"""Build the kit's usage presentation with its own renderer and export interfaces.

No model call. Screenshots and editable slide sources live in examples/usage-demo.
"""
import argparse
import base64
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from framework.python.presentation_authoring import validate_authoring_project
from framework.python.presentation_ai_markup import validate_page
from framework.python.presentation_ai import PresentationAiWorkspace


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'dist/usage-demo')
    args=parser.parse_args();source=ROOT/'examples/usage-demo';output=args.output
    project=json.loads((source/'project.json').read_text())
    for name in ('builder','draft','ai-edit','presenter','export'):
        image=source/'screens'/f'{name}.jpg'
        project['assets'].append({'id':name,'name':f'실제 {name} 화면','type':'image/jpeg','dataUrl':'data:image/jpeg;base64,'+base64.b64encode(image.read_bytes()).decode()})
    project=validate_authoring_project(project)
    pages={key:validate_page(page,{a['id'] for a in project['assets']}) for key,page in json.loads((source/'pages.json').read_text()).items()}
    workspace=PresentationAiWorkspace(ROOT);identifier=project['document']['id']
    # Rebuilding must not replace an edited demo's history.
    if workspace.head(identifier):
        snapshot=workspace.read(identifier)
        if snapshot['project']!=project or snapshot['pages']!=pages:
            raise SystemExit('이 ID의 데모가 수정됐습니다. 원본 project.json의 ID를 바꿔 별도 데모로 만드세요.')
    else:workspace.ensure(project,initial_pages=pages)
    output.mkdir(parents=True,exist_ok=True)
    (output/'presentation-project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n')
    (output/'presentation-ai-pages.json').write_text(json.dumps({'projectId':identifier,'pages':pages},ensure_ascii=False,indent=2)+'\n')
    (output/'usage-demo.zip').write_bytes(workspace.archive(identifier))
    (output/'watch.html').write_text((source/'watch-template.html').read_text().replace('__PROJECT_ID__',identifier))
    print(f'{len(project["document"]["slides"])} slides · {len(pages)} authored bodies')
    print(f'Open /app/deck.html?project={identifier}')
    print(f'Export /app/export.html?project={identifier}')
    print(output/'usage-demo.zip')


if __name__=='__main__':main()
