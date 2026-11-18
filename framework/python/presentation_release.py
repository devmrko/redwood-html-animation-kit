"""Explicit local packaging of trusted authored code; never exposed as an upload API."""
import copy
import io
import json
from pathlib import Path,PurePosixPath
import posixpath
import re
import zipfile
import hashlib
from .presentation_authoring import validate_authoring_project,create_authoring_bundle
from .presentation_structure import verify_evidence_files
from .presentation_media import verify_media_files
from .presentation_offline import create_offline_html


def release_file(root,name):
    if not isinstance(name,str) or len(name)>240 or not re.fullmatch(r'[A-Za-z0-9_./-]+',name) or any(not p or p.startswith('.') for p in name.split('/')) or not (name=='authored-pages.js' or name.startswith(('pages/','styles/','data/','assets/'))):raise ValueError('배포 파일은 등록된 pages/styles/data/assets 상대 경로만 허용합니다.')
    if Path(name).suffix.lower() not in ('.js','.mjs','.css','.json','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2'):raise ValueError('지원하지 않는 배포 파일 형식입니다.')
    path=root/name
    if any(p.is_symlink() for p in (path,*path.parents)) or not path.resolve().is_relative_to(root) or not path.is_file():raise ValueError('배포 파일이 없거나 심볼릭 링크입니다: '+name)
    return path


def create_release_bundle(root,output,manifest_name='presentation-release.json'):
    root=Path(root).resolve();manifest_path=root/manifest_name
    if manifest_path.is_symlink() or not manifest_path.resolve().is_relative_to(root) or manifest_path.stat().st_size>200000:raise ValueError('배포 manifest 경로·용량을 확인해 주세요.')
    manifest=json.loads(manifest_path.read_text())
    if not isinstance(manifest,dict) or manifest.get('version')!=1 or not isinstance(manifest.get('files'),list) or len(manifest['files'])>2000 or any(not isinstance(f,str) for f in manifest['files']) or len(set(manifest['files']))!=len(manifest['files']):raise ValueError('배포 manifest 파일 목록을 확인해 주세요.')
    if manifest.get('status')!='ready':raise ValueError('실제 화면·발표 기능을 검수한 뒤 배포 manifest의 status를 ready로 바꿔 주세요.')
    project_path=root/'presentation-project.json'
    if project_path.is_symlink() or project_path.stat().st_size>36*1024*1024:raise ValueError('발표 JSON 경로·용량을 확인해 주세요.')
    project=validate_authoring_project(json.loads(project_path.read_text()))
    files={name:release_file(root,name) for name in manifest['files']}
    if any(s.get('authored') for s in project['document']['slides']) and 'authored-pages.js' not in files:raise ValueError('제작한 페이지 등록 모듈이 없습니다.')
    if sum(p.stat().st_size for p in files.values())>250*1024*1024:raise ValueError('배포 코드·자산은 합계 250MB 이내여야 합니다.')
    verify_evidence_files(root,project.get('evidence',[]))
    verify_media_files(root,project.get('media',[]))
    draft=copy.deepcopy(project)
    for slide in draft['document']['slides']:slide.pop('authored',None)
    base=create_authoring_bundle(root,draft)
    with zipfile.ZipFile(io.BytesIO(base)) as archive:
        available={n for n in archive.namelist() if not n.startswith('pages/') and n!='authored-pages.js'}|set(files)
        # Registered code may import shared runtime, but may not rely on an
        # undeclared local module, remote host, or file outside the workspace.
        for name,path in files.items():
            if path.suffix not in ('.js','.mjs','.css'):continue
            source=path.read_text()
            refs=re.findall(r'(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\'\"]([^\'\"]+)[\'\"]',source) if path.suffix!='.css' else re.findall(r'(?:url\(\s*|@import\s+)[\'\"]?([^\'\"\s)]+)',source)
            if path.suffix in ('.js','.mjs') and re.search(r'\bimport\s*\(\s*[^\s\'\"]',source):raise ValueError('동적 모듈 경로 대신 명시된 로컬 import를 사용해 주세요: '+name)
            for ref in refs:
                if ref.startswith(('data:','#')):continue
                target=posixpath.normpath(posixpath.join(str(PurePosixPath(name).parent),ref.split('?')[0].split('#')[0]))
                if not ref.startswith('.') or target.startswith('../') or target not in available:raise ValueError('배포에 없는 의존 파일 또는 외부 import입니다: '+name+' → '+ref)
        output=Path(output).resolve()
        if output==project_path or output in files.values():raise ValueError('입력 파일을 출력 ZIP으로 덮어쓸 수 없습니다.')
        output.parent.mkdir(parents=True,exist_ok=True)
        exclude={'presentation-project.json','authored-pages.js','README.md','index.html','presentation-release.json'}
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as result:
            for name in archive.namelist():
                if name not in exclude and not name.startswith('pages/') and name not in files:result.writestr(name,archive.read(name))
            for name,path in files.items():result.write(path,name)
            result.writestr('presentation-project.json',json.dumps(project,ensure_ascii=False,indent=2)+'\n')
            result.writestr('presentation-release.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
            result.writestr('README.md','# 발표 실행본\n\nZIP을 풀고 index.html을 더블클릭하면 발표를 엽니다. 영상·스크린샷 파일은 옆 폴더와 함께 보관합니다. AI 편집·영상 변환은 python3 start.py --no-browser로 실행합니다. 이 폴더 전체로 전달하세요. API 키는 포함하지 않았습니다.\n')
            portable=root/'presentation-ai-pages.json';pages={}
            if portable.is_file() and not portable.is_symlink():
                value=json.loads(portable.read_text())
                if value.get('projectId')==project['document']['id']:pages=value.get('pages',{})
            result.writestr('index.html',create_offline_html(root,project,pages))
            provenance={'version':1,'source':manifest.get('source',{}),'files':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()},'projectSha256':hashlib.sha256(json.dumps(project,ensure_ascii=False,sort_keys=True).encode()).hexdigest()}
            result.writestr('release-provenance.json',json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
    return output
