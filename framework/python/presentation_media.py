"""Validated file clips and explicit YouTube references. No remote downloading."""
import hashlib
import math
from pathlib import Path
import re
from urllib.parse import urlsplit,parse_qs


def youtube_id(value):
    if not isinstance(value,str):raise ValueError('YouTube 영상 ID를 확인해 주세요.')
    if re.fullmatch(r'[A-Za-z0-9_-]{11}',value):return value
    url=urlsplit(value)
    if url.scheme!='https' or url.username or url.password or url.port:raise ValueError('HTTPS YouTube 주소만 지원합니다.')
    identifier=''
    if url.hostname=='youtu.be':identifier=url.path[1:]
    elif url.hostname in ('youtube.com','www.youtube.com','m.youtube.com'):
        if url.path=='/watch':identifier=parse_qs(url.query).get('v',[''])[0]
        else:
            match=re.fullmatch(r'/(?:embed|shorts)/([A-Za-z0-9_-]{11})/?',url.path)
            if match:identifier=match[1]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}',identifier):raise ValueError('지원하는 YouTube 영상 주소가 아닙니다.')
    return identifier


def safe_media_path(path):return isinstance(path,str) and len(path)<=240 and re.fullmatch(r'media/[A-Za-z0-9_./-]+\.(?:mp4|webm)',path,re.I) and all(p and not p.startswith('.') for p in path.split('/'))


def validate_media(entries):
    if not isinstance(entries,list) or len(entries)>50:raise ValueError('동영상은 최대 50개까지 지원합니다.')
    ids=set();total=0
    for m in entries:
        if not isinstance(m,dict) or not isinstance(m.get('id'),str) or not re.fullmatch(r'[a-z0-9-]{1,80}',m['id']) or m['id'] in ids or not isinstance(m.get('title'),str) or not m['title'].strip() or len(m['title'])>200 or m.get('kind') not in ('file','youtube'):raise ValueError('동영상 ID·제목·종류를 확인해 주세요.')
        start,end,at=m.get('start',0),m.get('end'),m.get('at',0)
        if any(type(v) not in (int,float) or abs(v)>86400 or not math.isfinite(v) for v in (start,end,at)) or start<0 or end<=start or end>86400 or at<0 or at+end-start>600 or not isinstance(m.get('muted',True),bool):raise ValueError('동영상 시작·끝·등장 시간·음소거를 확인해 주세요 (장표 내 최대 600초).')
        ids.add(m['id'])
        if m['kind']=='youtube':youtube_id(m.get('videoId'));continue
        if not safe_media_path(m.get('path')) or m.get('type') not in ('video/mp4','video/webm') or type(m.get('bytes')) is not int or not 0<m['bytes']<=100*1024*1024 or not isinstance(m.get('sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',m['sha256']):raise ValueError('동영상 파일 경로·형식·용량·해시를 확인해 주세요.')
        total+=m['bytes']
    if total>250*1024*1024:raise ValueError('동영상 파일 합계는 250MB 이내여야 합니다.')


_verified={}
def verify_media_files(root,entries):
    validate_media(entries);root=Path(root).resolve();paths=[]
    for m in entries:
        if m['kind']!='file':continue
        path=root/m['path']
        if any(p.is_symlink() for p in (path,*path.parents)) or not path.resolve().is_relative_to(root) or not path.is_file():raise ValueError('동영상 파일 경로를 확인해 주세요.')
        stat=path.stat()
        if stat.st_size!=m['bytes']:raise ValueError('동영상 파일 용량이 manifest와 다릅니다.')
        key=(str(path),stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns,m['sha256'],m['type'])
        if key not in _verified:
            with path.open('rb') as stream:
                prefix=stream.read(16);stream.seek(0);digest=hashlib.sha256()
                while data:=stream.read(1024*1024):digest.update(data)
            kind='video/mp4' if prefix[4:8]==b'ftyp' else 'video/webm' if prefix.startswith(b'\x1aE\xdf\xa3') else None
            if kind!=m['type'] or digest.hexdigest()!=m['sha256']:raise ValueError('동영상 파일의 형식·SHA-256이 manifest와 다릅니다.')
            if len(_verified)>256:_verified.clear()
            _verified[key]=True
        paths.append(path)
    return paths
