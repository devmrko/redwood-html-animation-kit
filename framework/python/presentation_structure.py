"""Structured page data and file evidence, independent of the HTTP host."""
import hashlib
import json
import math
from pathlib import Path
import re
from datetime import datetime


def safe_evidence_path(value):
    return isinstance(value,str) and len(value)<=240 and re.fullmatch(r'evidence/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)',value,re.I) and all(p and not p.startswith('.') for p in value.split('/'))


def validate_page_data(value):
    nodes=0
    def visit(v,depth):
        nonlocal nodes
        nodes+=1
        if nodes>10000 or depth>8:raise ValueError('본문 데이터는 깊이 8·항목 10000개 이내여야 합니다.')
        if v is None or isinstance(v,(str,bool)):return
        if type(v) in (int,float) and abs(v)<=1.7976931348623157e308 and math.isfinite(v):return
        if isinstance(v,list):
            for item in v:visit(item,depth+1)
            return
        if isinstance(v,dict):
            for k,item in v.items():
                if not isinstance(k,str) or k in ('__proto__','constructor','prototype'):raise ValueError('본문 데이터 키를 확인해 주세요.')
                visit(item,depth+1)
            return
        raise ValueError('본문에는 JSON 데이터만 넣을 수 있습니다.')
    if not isinstance(value,dict):raise ValueError('본문 데이터는 JSON 객체여야 합니다.')
    visit(value,0)
    if len(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False))>200000:raise ValueError('본문 데이터는 200000자 이내여야 합니다.')


def validate_structure(project):
    doc=project['document'];slides=doc['slides']
    for key,limit in (('purpose',1000),('audience',600),('decision',1000)):
        if key in doc and (not isinstance(doc[key],str) or len(doc[key])>limit):raise ValueError('목적·청중·판단 길이를 확인해 주세요.')
    mapping={s['id']:s for s in slides}
    for slide in slides:
        if slide.get('role','main') not in ('main','detail','appendix'):raise ValueError('장표 역할을 확인해 주세요.')
        if slide.get('agendaMode','divider') not in ('divider','navigation'):raise ValueError('목차 종류를 확인해 주세요.')
        if 'message' in slide and (not isinstance(slide['message'],str) or len(slide['message'])>600):raise ValueError('핵심 메시지를 확인해 주세요.')
        if 'data' in slide:validate_page_data(slide['data'])
        if 'parentId' in slide and (not isinstance(slide['parentId'],str) or slide['parentId'] not in mapping):raise ValueError('상위 장표 참조를 확인해 주세요.')
        seen=set();current=slide
        while current.get('parentId'):
            parent=current['parentId']
            if not isinstance(parent,str) or parent not in mapping or parent in seen:raise ValueError('상위 장표 참조가 없거나 순환합니다.')
            seen.add(parent);current=mapping[parent]
    entries=project.get('evidence',[])
    if not isinstance(entries,list) or len(entries)>500:raise ValueError('증거는 최대 500개까지 지원합니다.')
    ids=set();total=0
    for e in entries:
        if not isinstance(e,dict) or not isinstance(e.get('id'),str) or not re.fullmatch(r'[a-z0-9-]{1,80}',e['id']) or e['id'] in ids or not safe_evidence_path(e.get('path')):raise ValueError('증거 ID·경로를 확인해 주세요.')
        if e.get('type') not in ('image/png','image/jpeg','image/webp') or type(e.get('bytes')) is not int or not 0<e['bytes']<=20*1024*1024 or not isinstance(e.get('sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',e['sha256']) or e.get('kind') not in ('capture','revisit','log','mock'):raise ValueError('증거 형식·용량·해시·촬영 성격을 확인해 주세요.')
        for key,limit in (('title',200),('claim',1000),('source',1000),('capturedAt',40)):
            value=e.get(key,'')
            if not isinstance(value,str) or len(value)>limit or '\0' in value or (key=='title' and not value.strip()):raise ValueError('증거 설명·출처를 확인해 주세요.')
        if e.get('capturedAt'):
            try:
                if not re.match(r'^\d{4}-\d\d-\d\dT',e['capturedAt']):raise ValueError()
                datetime.fromisoformat(e['capturedAt'].replace('Z','+00:00'))
            except ValueError:raise ValueError('증거 촬영 시각은 ISO 날짜로 입력해 주세요.') from None
        ids.add(e['id']);total+=e['bytes']
    if total>250*1024*1024:raise ValueError('증거 합계는 250MB 이내여야 합니다.')
    for slide in slides:
        refs=slide.get('evidenceIds',[])
        if not isinstance(refs,list) or len(refs)>500 or any(not isinstance(v,str) or v not in ids for v in refs) or len(set(refs))!=len(refs):raise ValueError('장표 증거 참조를 확인해 주세요.')


def evidence_file(root,path):
    if not safe_evidence_path(path):raise ValueError('증거 상대 경로를 확인해 주세요.')
    root=Path(root).resolve();candidate=root/path
    if any(p.is_symlink() for p in (candidate,*candidate.parents)) or not candidate.resolve().is_relative_to(root) or not candidate.is_file() or candidate.stat().st_size>20*1024*1024:raise ValueError('증거 파일이 없거나 안전하지 않은 경로·용량입니다.')
    return candidate


def verify_evidence_files(root,entries):
    result=[]
    for entry in entries:
        path=evidence_file(root,entry['path']);data=path.read_bytes()
        kind='image/png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if data.startswith(b'\xff\xd8\xff') else 'image/webp' if data[:4]==b'RIFF' and data[8:12]==b'WEBP' else None
        if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256'] or kind!=entry['type']:raise ValueError('증거 파일의 용량·형식·SHA-256이 manifest와 다릅니다: '+entry['id'])
        result.append(path)
    return result
