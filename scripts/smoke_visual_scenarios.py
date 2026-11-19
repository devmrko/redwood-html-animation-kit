"""Explicit, paid-model smoke run against a local server using public fixture content.

Not included in npm test. Example:
python3 scripts/smoke_visual_scenarios.py --origin http://127.0.0.1:4176 --provider openai
"""
import argparse
import base64
from html.parser import HTMLParser
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[1]
CASES=[
 ('photo','사진과 설명을 함께 봅니다',['공개 템플릿 이미지','사진 비율 유지'],
  '본문 배치를 사진 왼쪽 65%, 설명 오른쪽으로 바꿔 주세요. photo-1 사진을 실제로 넣고 비율을 유지하세요. 사진은 fade, 설명은 slide-up 효과로 차례로 표시하세요.','img'),
 ('illustration','저장소와 연결 관계를 그림으로 표시합니다',['문서','중앙 저장소','검토자'],
  '본문 배치를 SVG 벡터 그림으로 바꿔 주세요. 문서 그림, 원통형 중앙 저장소 그림, 검토자 그림을 선으로 연결하세요. 각 그림 아래에 이름을 표시하고 그림 세 개를 차례로 나타나게 하세요.','svg'),
 ('flow','등록 후 검토를 거쳐 저장합니다',['등록','검토','저장'],
  '본문 배치를 SVG 흐름도로 바꿔 주세요. 등록 → 검토 → 저장 세 상자와 화살표를 가로로 배치하고 단계마다 slide-left 효과를 순차 적용하세요.','svg'),
 ('bar','B의 수량이 가장 많습니다',['A 30건','B 50건','C 20건'],
  '본문을 SVG 막대 차트로 바꿔 주세요. 검증용 값 A=30, B=50, C=20건을 정확한 막대 높이로 나타내고 각 막대 위에 수치와 아래에 이름을 표시하세요. 막대 세 개를 차례로 등장시키세요.','bar'),
 ('line','4주차 값이 가장 높습니다',['1주 12건','2주 18건','3주 15건','4주 24건'],
  '본문을 SVG 선 차트로 바꿔 주세요. 검증용 값 1주=12, 2주=18, 3주=15, 4주=24건을 점과 선으로 연결하고 각 점의 값을 표시하세요. 선과 점에 등장 효과를 넣으세요.','line'),
 ('donut','A가 전체의 절반을 차지합니다',['A 50%','B 30%','C 20%'],
  '본문을 SVG 도넛 차트로 바꿔 주세요. 검증용 구성 A=50%, B=30%, C=20%를 정확한 원호 비율로 표시하세요. 조각별 색과 이름·백분율 범례를 붙이고 조각을 차례로 표시하세요.','donut'),
 ('effects','네 가지 등장 효과를 같은 화면에서 확인합니다',['fade','slide-up','slide-left','scale'],
  '본문 배치를 네 카드로 바꿔 주세요. 카드에는 fade, slide-up, slide-left, scale만 각각 적고 각 카드에 해당 효과를 정확히 한 개씩 적용하세요. at은 각각 0.5, 2, 3.5, 5초, duration은 각 0.8초, 전체는 8초로 하세요.','effects'),
]


class Features(HTMLParser):
 def __init__(self):super().__init__();self.tags=[];self.text=[];self.images=[]
 def handle_starttag(self,tag,attrs):
  self.tags.append(tag)
  if tag=='img':self.images.append(dict(attrs).get('data-asset-id'))
 def handle_data(self,text):self.text.append(text)


def check_case(kind,page):
 features=Features();features.feed(page['html']);text=' '.join(features.text)
 if kind=='img' and 'photo-1' not in features.images:raise ValueError('사진 자산이 실제 본문에 없습니다.')
 if kind in ('svg','bar','line','donut') and 'svg' not in features.tags:raise ValueError('SVG 그림이 실제 본문에 없습니다.')
 expected={'bar':['30','50','20'],'line':['12','18','15','24'],'donut':['50','30','20']}.get(kind,[])
 if any(value not in text for value in expected):raise ValueError('차트의 실제 본문에서 제공 수치를 찾을 수 없습니다.')
 effects=page['effects']
 if kind=='effects' and {e['type'] for e in effects}!={'fade','slide-up','slide-left','scale'}:raise ValueError('네 가지 효과가 모두 구성되지 않았습니다.')
 if not effects:raise ValueError('요청한 등장 효과가 없습니다.')


def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--origin',required=True);parser.add_argument('--provider',required=True,choices=['openai','oci','cli']);parser.add_argument('--model',default='');parser.add_argument('--tool',default='codex',choices=['codex','claude']);parser.add_argument('--output',default='/tmp/redwood-visual-scenarios');args=parser.parse_args()
 origin=args.origin.rstrip('/');url=urllib.parse.urlsplit(origin)
 if url.scheme!='http' or url.hostname!='127.0.0.1' or not url.port or url.path:parser.error('실행 중인 127.0.0.1 HTTP 서버 주소를 지정해 주세요.')
 output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
 def api(path,payload=None):
  request=urllib.request.Request(origin+path,data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None,headers={'Content-Type':'application/json','Origin':origin})
  try:
   with urllib.request.urlopen(request,timeout=420) as response:return json.load(response)
  except urllib.error.HTTPError as error:
   try:message=json.load(error).get('error')
   except ValueError:message=str(error.code)
   raise RuntimeError(message) from None
 project=json.loads((ROOT/'examples/presentation-project.json').read_text());doc=project['document'];doc['id']=str(uuid.uuid4());doc['title']='검증용 · 그림·차트·효과';doc['appearance']='light';doc['scenario']='공개 예제 자산과 명시적인 합성 수치를 사용하는 기능 검증 자료입니다.'
 image=ROOT/'assets/redwood-cover.jpeg';project['assets']=[{'id':'photo-1','name':'공개 템플릿 이미지','type':'image/jpeg','dataUrl':'data:image/jpeg;base64,'+base64.b64encode(image.read_bytes()).decode()}]
 cover=doc['slides'][0];cover['title']=doc['title'];cover['subtitle']='사진 · SVG · 흐름도 · 막대 · 선 · 도넛 · 효과';closing=doc['slides'][-1]
 slides=[]
 for identifier,title,items,_,_ in CASES:
  slides.append({'id':identifier,'layout':'content','title':title,'subtitle':'','section':'그림·차트·효과 검증','items':items,'notes':'검증용 예제입니다. '+'. '.join(items)+'.','data':{'fixture':True}})
 doc['slides']=[cover,*slides,closing];project_id=doc['id'];api('/api/projects/'+project_id,project);state=api('/api/ai/projects/'+project_id+'/init',{'project':project});head=state['head'];snapshot=state['snapshot'];report=[]
 (output/'input.json').write_text(json.dumps(project,ensure_ascii=False,indent=2))
 print('OPEN '+origin+'/app/deck.html?project='+project_id,flush=True)
 for identifier,_,_,request,kind in CASES:
  started=time.monotonic();print('START '+identifier,flush=True)
  try:
   proposal=api('/api/ai/projects/'+project_id+'/propose',{'base':head,'slideId':identifier,'request':request+' 제목과 발표 노트는 유지하세요. Redwood 공통 디자인과 테마 색을 사용하고 본문은 1400×560 안에 넣으세요.','connection':{'provider':args.provider,'tool':args.tool,'model':args.model}})
   page=proposal['snapshot']['pages'].get(identifier)
   if page is None:raise ValueError('요청한 화면 구성 대신 내용만 바뀌었습니다.')
   check_case(kind,page)
   before=next(s for s in snapshot['project']['document']['slides'] if s['id']==identifier);after=next(s for s in proposal['snapshot']['project']['document']['slides'] if s['id']==identifier)
   if before['title']!=after['title'] or before['notes']!=after['notes']:raise ValueError('유지할 제목·스크립트가 바뀌었습니다.')
   others=lambda p:[s for s in p['document']['slides'] if s['id']!=identifier]
   if others(snapshot['project'])!=others(proposal['snapshot']['project']):raise ValueError('다른 장표가 바뀌었습니다.')
   applied=api('/api/ai/projects/'+project_id+'/apply',{'token':proposal['token']});head=applied['revision'];snapshot=proposal['snapshot'];result={'id':identifier,'state':'applied','revision':head,'seconds':round(time.monotonic()-started,1),'effects':len(page['effects'])}
   (output/(identifier+'.json')).write_text(json.dumps(proposal,ensure_ascii=False,indent=2))
  except (RuntimeError,ValueError,KeyError) as error:result={'id':identifier,'state':'failed','error':str(error),'seconds':round(time.monotonic()-started,1)}
  report.append(result);(output/'report.json').write_text(json.dumps({'origin':origin,'projectId':project_id,'results':report},ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False),flush=True)
 (output/'project.json').write_text(json.dumps(snapshot['project'],ensure_ascii=False,indent=2))
 print('RESULT '+str(sum(r['state']=='applied' for r in report))+'/'+str(len(report)),flush=True)
 if any(r['state']=='failed' for r in report):raise SystemExit(1)


if __name__=='__main__':main()
