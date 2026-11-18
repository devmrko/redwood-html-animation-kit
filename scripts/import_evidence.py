"""Import raster evidence files into a local workspace without embedding bytes in JSON."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys
import uuid

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from framework.python.presentation_authoring import validate_authoring_project


def import_evidence(root,directory,*,kind,source,claim='',captured_at=None,slide_id=None):
    root=Path(root).resolve();directory=Path(directory).resolve();target=root/'evidence';path=root/'presentation-project.json'
    if path.is_symlink() or path.stat().st_size>36*1024*1024 or target.is_symlink():raise ValueError('발표 JSON·증거 디렉터리 경로를 확인해 주세요.')
    project=validate_authoring_project(json.loads(path.read_text()));entries=project.setdefault('evidence',[]);pending=[]
    selected=next((s for s in project['document']['slides'] if s['id']==slide_id),None)
    if slide_id and not selected:raise ValueError('증거를 연결할 장표가 없습니다.')
    for file in sorted(directory.iterdir()):
        if file.is_symlink() or not file.is_file() or file.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):continue
        if not 0<file.stat().st_size<=20*1024*1024:raise ValueError('증거 파일은 각 20MB 이내여야 합니다.')
        data=file.read_bytes();mime='image/png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if data.startswith(b'\xff\xd8\xff') else 'image/webp' if data[:4]==b'RIFF' and data[8:12]==b'WEBP' else None
        if not mime:raise ValueError('PNG·JPEG·WebP 원본만 지원합니다.')
        identifier='evidence-'+uuid.uuid4().hex;extension={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[mime]
        entry={'id':identifier,'title':file.name,'path':'evidence/'+identifier+extension,'type':mime,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'kind':kind,'claim':claim,'source':source}
        if captured_at:entry['capturedAt']=captured_at
        entries.append(entry);pending.append((file,entry['path']))
    if not pending:raise ValueError('가져올 래스터 증거 파일이 없습니다.')
    if selected:selected['evidenceIds']=selected.get('evidenceIds',[])+[e['id'] for e in entries[-len(pending):]]
    validate_authoring_project(project);target.mkdir(exist_ok=True)
    for file,name in pending:shutil.copyfile(file,root/name)
    staging=path.with_name('.evidence-project-'+uuid.uuid4().hex+'.pending');staging.write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n');staging.replace(path)
    return len(pending)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description='증거 디렉터리의 PNG/JPEG/WebP를 해시·출처와 함께 등록합니다.')
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--kind',choices=['capture','revisit','log','mock'],required=True);parser.add_argument('--source',required=True);parser.add_argument('--claim',default='');parser.add_argument('--captured-at');parser.add_argument('--slide')
    args=parser.parse_args()
    try:print('Imported:',import_evidence(args.root,args.directory,kind=args.kind,source=args.source,claim=args.claim,captured_at=args.captured_at,slide_id=args.slide))
    except (OSError,ValueError) as error:raise SystemExit(str(error)) from None
