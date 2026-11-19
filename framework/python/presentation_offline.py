"""Package data, styles and a static local module graph into a double-click HTML."""
import html
import json
from pathlib import Path,PurePosixPath
import posixpath
import re
from .presentation_authoring import validate_authoring_project

REF=re.compile(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']''')


def embedded_json(value):return json.dumps(value,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')


def offline_modules(root,entry,overrides=None):
    root=Path(root).resolve();modules={};visiting=set();overrides=overrides or {}
    def visit(name,source=None):
        if name in visiting:raise ValueError('더블클릭 배포에서는 순환 JavaScript import를 사용할 수 없습니다: '+name)
        if name in modules:return
        visiting.add(name)
        if source is None:
            if name in overrides:source=overrides[name]
            else:
                path=root/name
                if path.suffix not in ('.js','.mjs') or any(p.is_symlink() for p in (path,*path.parents)) or not path.resolve().is_relative_to(root) or not path.is_file():raise ValueError('발표용 로컬 모듈을 확인해 주세요: '+name)
                source=path.read_text()
        if re.search(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](?:https?:|/)''',source) or re.search(r'\bimport\s*\(\s*[^\s\'\"]',source):raise ValueError('더블클릭 배포는 명시된 로컬 모듈 import만 지원합니다: '+name)
        if name.startswith('pages/') and re.search(r'\bfetch\s*\(',source):raise ValueError('본문의 fetch 데이터를 slide.data 또는 로컬 모듈에 포함한 뒤 다시 배포해 주세요: '+name)
        refs={}
        for match in REF.finditer(source):
            ref=match[1];target=posixpath.normpath(posixpath.join(str(PurePosixPath(name).parent),ref))
            if target.startswith('../') or any(p.startswith('.') for p in target.split('/')):raise ValueError('발표용 모듈 경로를 확인해 주세요.')
            refs[ref]=target;visit(target)
        visiting.remove(name);modules[name]={'source':source,'refs':refs}
    visit('offline-entry.js',entry)
    return modules


def offline_css(root):
    root=Path(root).resolve();seen=set()
    def read(name):
        if name in seen:return ''
        seen.add(name);path=root/name
        if path.is_symlink() or not path.resolve().is_relative_to(root):raise ValueError('스타일 경로를 확인해 주세요.')
        source=path.read_text()
        source=re.sub(r'''@import\s+["']([^"']+)["'];?''',lambda m:read(posixpath.normpath(posixpath.join(str(PurePosixPath(name).parent),m[1]))),source)
        source=re.sub(r'''url\(\s*["']?([^"'\s)]+)["']?\s*\)''',lambda m:'url("'+(m[1] if m[1].startswith(('data:','#','http:','https:')) else posixpath.normpath(posixpath.join(str(PurePosixPath(name).parent),m[1])))+'")',source)
        return source
    return '\n'.join(read(name) for name in ('vendor/foundation/ui/ui.css','templates/oracle-corporate.css','app/offline.css'))


def create_offline_html(root,project,pages=None,*,overrides=None):
    root=Path(root);project=validate_authoring_project(project);pages=pages or {}
    entry="import './app/offline.js';";modules=offline_modules(root,entry,overrides)
    css=offline_css(root).replace('</style','<\\/style')
    loader='''const graph=JSON.parse(document.getElementById('offline-modules').textContent),urls=new Map();
function moduleUrl(id){if(urls.has(id))return urls.get(id);const node=graph[id];let source=node.source;for(const [ref,target] of Object.entries(node.refs)){const url=moduleUrl(target);source=source.split(JSON.stringify(ref)).join(JSON.stringify(url)).split("'"+ref+"'").join(JSON.stringify(url));}const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(id,url);return url;}
import(moduleUrl('offline-entry.js')).catch(error=>{document.getElementById('offline-error').textContent='발표를 열지 못했습니다: '+error.message;const token=new URL(location.href).searchParams.get('presentationLaunch');if(token&&window.opener)window.opener.postMessage({type:'presentation-ready',token,error:String(error.message).slice(0,300)},location.protocol==='file:'?'*':location.origin);});'''
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(project['document']['title'])+'</title><link rel="icon" href="data:,"><style>'+css+'</style></head><body class="rf-theme">'
            '<nav class="offline-toolbar" aria-label="발표 조작"><a href="./examples/animations/samples.html">애니메이션 샘플</a><button id="offline-ai">AI 편집</button><button id="offline-toc">전체</button><button id="offline-find">찾기</button><button id="offline-parent">상위</button><button id="offline-previous">← 이전</button><span id="offline-page"></span><button id="offline-next">다음 →</button><button id="offline-replay">다시 재생</button><button id="offline-pause">일시정지</button><button id="offline-present">발표 시작</button><button id="offline-speaker">발표자 보기</button><button id="offline-evidence">증거</button><span id="offline-status" role="status"></span></nav>'
            '<main id="offline-stage"><div id="offline-slides" class="offline-canvas"></div></main><aside id="offline-notes"><h2>발표 스크립트</h2><p id="offline-notes-title"></p><div id="offline-notes-body"></div><p id="offline-next-title"></p></aside><p id="offline-error" role="alert"></p>'
            '<script type="application/json" id="offline-data">'+embedded_json({'project':project,'pages':pages})+'</script><script type="application/json" id="offline-modules">'+embedded_json(modules)+'</script><script>'+loader+'</script></body></html>')


def create_embedded_example(root,filename):
    """Keep the original sample HTML and effects, inlining its public runtime only."""
    root=Path(root);source=(root/filename).read_text()
    source=re.sub(r'<script id="file-entry">[\s\S]*?</script>','',source)
    if filename=='examples/animations/index.html':
        source=source.replace('<body class=', '<body data-offline-samples="true" class=',1).replace('./examples/components/index.html','./examples/components/standalone.html')
    else:source=source.replace('./examples/animations/index.html#/effect-presets','./examples/animations/samples.html#/effect-presets')
    def style(match):
        name=match[1].removeprefix('./');path=root/name
        css=path.read_text()
        # Resolve imports relative to the source stylesheet before inlining.
        def expand(value,current,seen):
            if current in seen:return ''
            seen.add(current)
            pattern=r'''@import\s+["']([^"']+)["'];?'''
            def imported(m):
                target=posixpath.normpath(posixpath.join(str(PurePosixPath(current).parent),m[1]))
                return expand((root/target).read_text(),target,seen)
            return re.sub(pattern,imported,value)
        css=expand(css,name,set())
        return '<style>'+css.replace('</style','<\\/style')+'</style>'
    source=re.sub(r'''<link rel="stylesheet" href="([^"]+)">''',style,source)
    def classic(match):return '<script>'+(root/match[1].removeprefix('./')).read_text().replace('</script','<\\/script')+'</script>'
    source=re.sub(r'''<script src="([^"]+)"></script>''',classic,source)
    def module(match):
        name=match[1].removeprefix('./');graph=offline_modules(root,"import './"+name+"';")
        loader="""const graph=JSON.parse(document.getElementById('sample-modules').textContent),urls=new Map();function moduleUrl(id){if(urls.has(id))return urls.get(id);const node=graph[id];let source=node.source;for(const [ref,target] of Object.entries(node.refs)){const url=moduleUrl(target);source=source.split(JSON.stringify(ref)).join(JSON.stringify(url)).split("'"+ref+"'").join(JSON.stringify(url));}const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(id,url);return url;}import(moduleUrl('offline-entry.js')).catch(e=>{const n=document.createElement('p');n.textContent='샘플 실행 오류: '+e.message;document.body.prepend(n);});"""
        return '<script type="application/json" id="sample-modules">'+embedded_json(graph)+'</script><script>'+loader+'</script>'
    return re.sub(r'''<script type="module" src="([^"]+)"></script>''',module,source)
