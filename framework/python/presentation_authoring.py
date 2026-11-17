"""Build a local agent workspace from an explicit runtime allowlist and one project."""
import base64
import copy
import html
import io
import json
import math
from pathlib import Path
import re
import zipfile

ROOT_FILES = ('start.py','builder.html','builder.css','builder.js','deck.html','deck.css','deck.js',
              'export.html','export.css','export.js','project-store.js','template-theme.js','.env.example','.gitignore','package.json','package-lock.json')
RUNTIME_DIRS = ('vendor','framework','templates','authoring','scripts','examples')
ASSETS = ('oracle-wordmark.svg','oracle-o.svg','redwood-cover.jpeg','redwood-closing.jpg',
          'redwood-agenda-art.png','redwood-template-pattern.jpg','REDWOOD-SOURCE.txt')
ALLOWED_SUFFIXES = {'.js','.mjs','.css','.ts','.py','.json','.md','.txt'}
ID = r'[a-z0-9-]{1,80}'
UUID = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'


def validate_authoring_project(project):
    if not isinstance(project,dict) or not isinstance(project.get('document'),dict) or not isinstance(project.get('assets'),list):
        raise ValueError('프로젝트 JSON 형식을 확인해 주세요.')
    doc=project['document']
    if doc.get('version')!=1 or not isinstance(doc.get('id'),str) or not re.fullmatch(UUID,doc['id']):
        raise ValueError('프로젝트 버전·ID를 확인해 주세요.')
    for key,maximum,required in (('title',100,True),('presenter',200,False),('scenario',30000,False),('brief',4000,False)):
        value=doc.get(key,'')
        if not isinstance(value,str) or len(value)>maximum or (required and not value.strip()):
            raise ValueError('발표 제목·시나리오·제작 요청을 확인해 주세요.')
    slides=doc.get('slides')
    if not isinstance(slides,list) or not 1<=len(slides)<=60:
        raise ValueError('장표는 1~60장까지 지원합니다.')
    used=set()
    for slide in slides:
        if not isinstance(slide,dict) or not isinstance(slide.get('id'),str) or not re.fullmatch(ID,slide['id']) or slide['id'] in used:
            raise ValueError('장표 ID를 확인해 주세요.')
        used.add(slide['id'])
        if slide.get('layout') not in ('cover','section','content','photo','steps','comparison','closing'):
            raise ValueError('장표 종류를 확인해 주세요.')
        for key,maximum in (('title',100),('section',120),('subtitle',220),('notes',6000),('design',4000),('imageAlt',240)):
            value=slide.get(key,'')
            if not isinstance(value,str) or len(value)>maximum or (key=='title' and not value.strip()):
                raise ValueError('장표 내용 길이를 확인해 주세요.')
        if not isinstance(slide.get('items'),list) or len(slide['items'])>6 or any(not isinstance(v,str) or not v.strip() or len(v)>240 for v in slide['items']):
            raise ValueError('장표 핵심 내용을 확인해 주세요.')
        duration=slide.get('duration')
        if duration is not None and (type(duration) not in (int,float) or not math.isfinite(duration) or not 1<=duration<=600):
            raise ValueError('장표 시간은 1~600초로 입력해 주세요.')
        if 'authored' in slide and not isinstance(slide['authored'],bool):
            raise ValueError('페이지 제작 상태를 확인해 주세요.')
        if slide.get('imageId') is not None and (not isinstance(slide['imageId'],str) or not re.fullmatch(ID,slide['imageId'])):
            raise ValueError('장표 사진 ID를 확인해 주세요.')
    if len(project['assets'])>20:
        raise ValueError('사진은 최대 20개까지 지원합니다.')
    asset_ids=set();total=0
    for asset in project['assets']:
        if not isinstance(asset,dict) or not isinstance(asset.get('id'),str) or not re.fullmatch(ID,asset['id']) or asset['id'] in asset_ids:
            raise ValueError('사진 ID를 확인해 주세요.')
        asset_ids.add(asset['id'])
        if not isinstance(asset.get('name'),str) or not asset['name'].strip() or len(asset['name'])>200:
            raise ValueError('사진 파일명을 확인해 주세요.')
        source=asset.get('dataUrl','')
        if not isinstance(source,str) or len(source)>7000000:
            raise ValueError('사진 용량을 확인해 주세요.')
        match=re.fullmatch(r'data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})',source)
        if not match or asset.get('type')!=match[1]:
            raise ValueError('PNG·JPEG·WebP 사진만 지원합니다.')
        try: data=base64.b64decode(match[2],validate=True)
        except ValueError: raise ValueError('사진 데이터를 확인해 주세요.') from None
        valid=(match[1]=='image/png' and data.startswith(b'\x89PNG\r\n\x1a\n') or match[1]=='image/jpeg' and data.startswith(b'\xff\xd8\xff') or match[1]=='image/webp' and data[:4]==b'RIFF' and data[8:12]==b'WEBP')
        total+=len(data)
        if not valid or len(data)>5*1024*1024 or total>25*1024*1024:
            raise ValueError('사진 형식·용량을 확인해 주세요.')
    if any(s.get('imageId') and s['imageId'] not in asset_ids for s in slides):
        raise ValueError('장표 사진 참조를 확인해 주세요.')
    return project


def create_authoring_bundle(root, input_project):
    root=Path(root).resolve()
    project=copy.deepcopy(validate_authoring_project(input_project))
    # Unknown metadata must not become executable paths or silently enter a bundle.
    doc=project['document']
    project['document']={k:doc[k] for k in ('version','id','title','presenter','scenario','brief','slides') if k in doc}
    slides=[]
    for slide in doc['slides']:
        slides.append({k:slide[k] for k in ('id','layout','section','title','subtitle','items','notes','imageId','imageAlt','duration','design','authored') if k in slide})
    project['document']['slides']=slides
    project['assets']=[{k:a[k] for k in ('id','name','type','dataUrl') if k in a} for a in project['assets']]
    imports=[];entries=[];page_sources={}
    for index,slide in enumerate(slides):
        if slide['layout'] in ('cover','section','closing'):continue
        if slide.get('authored'):
            # Do not silently replace completed code with a starter or export other projects' code.
            raise ValueError('이미 제작한 페이지는 프로젝트 폴더 전체를 보관해 주세요. JSON에서 제작용 초안을 다시 내보내면 기존 코드를 잃을 수 있습니다.')
        slide['layout']='content';slide['authored']=True
        module=f'pages/{slide["id"]}.js'
        imports.append(f"import {{renderPage as page{index}}} from './{module}';")
        entries.append(f'[{json.dumps(slide["id"])},page{index}]')
        page_sources[module]=(root/'authoring/page-template.js').read_bytes()
    registry='\n'.join(imports)+f'\nconst pages=new Map([{",".join(entries)}]);\nexport const getAuthoredPages=id=>id==={json.dumps(doc["id"])}?pages:new Map();\n'
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        def add(path,name=None):
            if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root):
                archive.write(path,name or path.relative_to(root).as_posix())
        for name in ROOT_FILES:add(root/name)
        for directory in RUNTIME_DIRS:
            for path in sorted((root/directory).rglob('*')):
                if '__pycache__' not in path.parts and (path.suffix in ALLOWED_SUFFIXES or path.name=='LICENSE'):add(path)
        for name in ASSETS:add(root/'assets'/name)
        for name in ('AGENTS.md','CLAUDE.md','AUTHORING.md'):add(root/'authoring'/name,name)
        archive.writestr('presentation-project.json',json.dumps(project,ensure_ascii=False,indent=2)+'\n')
        archive.writestr('authored-pages.js',registry)
        for name,source in page_sources.items():archive.writestr(name,source)
        requests='\n\n'.join(f'### {i+1}. {s["title"]}\n{s.get("design","")}' for i,s in enumerate(slides) if s['layout'] not in ('cover','section','closing'))
        archive.writestr('REQUEST.md',f'# 제작 요청\n\n이 폴더의 AGENTS.md와 AUTHORING.md를 읽고 아래 발표를 제작해 주세요. 본문은 고정 레이아웃에 제한하지 말고 사용자 요청과 내용을 고려해 표·사진·SVG·효과로 구성하고 실제 브라우저에서 검수해 주세요.\n\n## 발표\n\n{doc["title"]}\n\n## 전체 화면 구성 요청\n\n{doc.get("brief","") or "내용에 맞게 구성해 주세요."}\n\n## 페이지별 요청\n\n{requests}\n\n## 원본 시나리오\n\n{doc.get("scenario","")}\n')
        archive.writestr('README.md',f'# {doc["title"]}\n\nCodex·Claude에서 이 폴더를 열고 REQUEST.md에 따라 페이지 제작을 요청하세요. 본문은 제작 전 초안입니다.\n\n실행: `python3 start.py --no-browser`\n\n자세한 제작·검수 방법은 [AUTHORING.md](AUTHORING.md)를 확인하세요. 실제 페이지 코드를 포함하는 이 폴더 전체를 보관하세요. API 키는 포함하지 않았습니다.\n')
        title=html.escape(doc['title']);project_id=doc['id']
        archive.writestr('index.html',f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{title}</title><h1>{title}</h1><p>제작용 프로젝트입니다. REQUEST.md를 확인하세요.</p><p><a href="./deck.html?project={project_id}">발표 화면</a> · <a href="./builder.html?project={project_id}">내용·스크립트 편집</a> · <a href="./export.html?project={project_id}">영상·SRT</a></p></html>')
    return output.getvalue()
