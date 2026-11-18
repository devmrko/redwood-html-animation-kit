"""Attach a local video clip or an explicit YouTube reference to a body slide."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import uuid

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from framework.python.presentation_authoring import validate_authoring_project
from framework.python.presentation_media import youtube_id


def import_media(root,*,slide_id,end,file=None,youtube=None,title=None,start=0,at=0,muted=True):
    root=Path(root).resolve();path=root/'presentation-project.json';folder=root/'media'
    if path.is_symlink() or path.stat().st_size>36*1024*1024 or folder.is_symlink() or bool(file)==bool(youtube):raise ValueError('발표 JSON·동영상 입력을 확인해 주세요.')
    project=validate_authoring_project(json.loads(path.read_text()));slide=next((s for s in project['document']['slides'] if s['id']==slide_id),None)
    if not slide or slide['layout'] in ('cover','section','closing'):raise ValueError('동영상을 넣을 본문 장표를 선택해 주세요.')
    entry={'id':'media-'+uuid.uuid4().hex,'title':title or (Path(file).name[:200] if file else 'YouTube 동영상'),'kind':'file' if file else 'youtube','start':start,'end':end,'at':at,'muted':muted}
    source=None
    if file:
        source=Path(file)
        if source.is_symlink() or source.suffix.lower() not in ('.mp4','.webm') or not 0<source.stat().st_size<=100*1024*1024:raise ValueError('MP4·WebM 파일은 각 100MB 이내여야 합니다.')
        digest=hashlib.sha256()
        with source.open('rb') as stream:
            prefix=stream.read(16);stream.seek(0)
            while data:=stream.read(1024*1024):digest.update(data)
        mime='video/mp4' if prefix[4:8]==b'ftyp' else 'video/webm' if prefix.startswith(b'\x1aE\xdf\xa3') else None
        if not mime:raise ValueError('지원하는 MP4·WebM 파일 형식이 아닙니다.')
        entry.update(path='media/'+entry['id']+('.mp4' if mime=='video/mp4' else '.webm'),type=mime,bytes=source.stat().st_size,sha256=digest.hexdigest())
    else:entry['videoId']=youtube_id(youtube)
    project.setdefault('media',[]).append(entry);slide.setdefault('mediaIds',[]).append(entry['id']);validate_authoring_project(project)
    if source:folder.mkdir(exist_ok=True);shutil.copyfile(source,root/entry['path'])
    staging=path.with_name('.media-project-'+uuid.uuid4().hex+'.pending');staging.write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n');staging.replace(path)
    return entry['id']


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='본문 장표에 MP4/WebM 또는 YouTube 영상을 연결합니다.')
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--slide',required=True)
    source=parser.add_mutually_exclusive_group(required=True);source.add_argument('--file',type=Path);source.add_argument('--youtube')
    parser.add_argument('--start',type=float,default=0);parser.add_argument('--end',type=float,required=True);parser.add_argument('--at',type=float,default=0);parser.add_argument('--title');parser.add_argument('--sound',action='store_true')
    args=parser.parse_args()
    try:print(import_media(args.root,slide_id=args.slide,end=args.end,file=args.file,youtube=args.youtube,title=args.title,start=args.start,at=args.at,muted=not args.sound))
    except (OSError,ValueError) as error:raise SystemExit(str(error)) from None
