"""Explicit live-provider smoke test with public fixture data only.

Calls the selected real provider (fees may apply). Never run by npm test.
Credentials stay in the server's existing .env or CLI login configuration.
"""
import argparse
import copy
from html.parser import HTMLParser
import json
import re
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[1]


class TableContent(HTMLParser):
    def __init__(self):super().__init__();self.tables=0;self.rows=[];self.row=None;self.cell=None;self.classes=set()
    def handle_starttag(self,tag,attrs):
        if tag=='table':self.tables+=1;self.classes.update(dict(attrs).get('class','').split())
        if tag=='tr':self.row=[]
        if tag in ('th','td'):self.cell=[]
    def handle_data(self,value):
        if self.cell is not None:self.cell.append(value)
    def handle_endtag(self,tag):
        if tag in ('th','td') and self.cell is not None:
            if self.row is not None:self.row.append(re.sub(r'\s+',' ',''.join(self.cell)).strip())
            self.cell=None
        if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None


def check_table(page):
    parsed=TableContent();parsed.feed(page['html'])
    if parsed.tables!=1 or parsed.rows!=[['항목','수량'],['A','10'],['B','20'],['C','30']]:raise ValueError('표의 머리글·행·열이 요청과 다릅니다.')
    if not {'rf-comparison-table','rf-comparison-table--compact'}.issubset(parsed.classes):raise ValueError('실제 table 요소에 공통 표 클래스가 없습니다.')
    if page['duration']!=4 or page['effects']!=[]:raise ValueError('요청한 재생 시간·효과 설정과 다릅니다.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',required=True);parser.add_argument('--provider',required=True,choices=['openai','cli','oci'])
    parser.add_argument('--tool',choices=['codex','claude'],default='codex');parser.add_argument('--model',default='')
    parser.add_argument('--region',default='');parser.add_argument('--profile',default='');parser.add_argument('--compartment',default='');parser.add_argument('--api-format',default='GENERIC',choices=['GENERIC','COHERE'])
    parser.add_argument('--case',choices=['all','title','table'],default='all');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    origin=args.origin.rstrip('/');url=urllib.parse.urlsplit(origin)
    if url.scheme!='http' or url.hostname!='127.0.0.1' or not url.port or url.path or url.query or url.fragment:parser.error('실행 중인 127.0.0.1 HTTP 서버 주소를 지정하세요.')
    args.output.mkdir(parents=True,exist_ok=False)
    def api(path,payload=None):
        request=urllib.request.Request(origin+path,data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None,headers={'Origin':origin,'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request,timeout=420) as response:return json.load(response)
        except urllib.error.HTTPError as error:
            try:message=json.load(error).get('error','AI 요청 실패')
            except ValueError:message=f'AI HTTP 응답 오류 ({error.code})'
            raise RuntimeError(str(message)) from None
        except (urllib.error.URLError,TimeoutError,OSError):raise RuntimeError('로컬 검증 서버에 연결하지 못했습니다.') from None
    project=json.loads((ROOT/'examples/presentation-project.json').read_text());identifier=str(uuid.uuid4());project['document'].update(id=identifier,title='실제 AI 연결 검증 · 공개 예제')
    connection={key:value for key,value in {'provider':args.provider,'tool':args.tool,'model':args.model,'region':args.region,'profile':args.profile,'compartment':args.compartment,'apiFormat':args.api_format}.items() if value}
    state=api('/api/ai/projects/'+identifier+'/init',{'project':project});baseline=state['snapshot'];path='projects/'+identifier+'/'
    (args.output/'input.json').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n')
    caps=api('/api/ai/capabilities');configured=caps.get(args.provider,{}).get('model','')
    report={'provider':args.provider,'tool':args.tool if args.provider=='cli' else None,'model':args.model or 'configured default','projectId':identifier,'deck':origin+'/app/deck.html?project='+identifier,'cases':[]}
    report['model']=args.model or configured or 'CLI default'
    def save():
        (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    save();print('OPEN '+report['deck'],flush=True)
    requests=[('title','제목만 정확히 "입력 후 검토합니다"로 바꿔 주세요. 본문·핵심 내용·발표 노트는 유지하세요. page=null로 반환하세요.'),
              ('table','본문을 2열 비교 표로 바꿔 주세요. 머리글은 항목/수량, 본문은 A/10, B/20, C/30 세 행입니다. table에 rf-comparison-table rf-comparison-table--compact 클래스를 사용하세요. 제목과 발표 노트·items는 유지하세요. page.duration=4, page.effects=[]로 반환하세요.')]
    if args.case!='all':requests=[entry for entry in requests if entry[0]==args.case]
    for kind,request in requests:
        started=time.monotonic();proposal=None;record={'case':kind,'state':'failed','checks':[]};report['cases'].append(record);save();print('START '+kind,flush=True)
        try:
            before=api('/api/ai/'+path+'state');assert before['snapshot']==baseline,'시험 전 원본 불일치'
            proposal=api('/api/ai/'+path+'propose',{'base':before['head'],'slideId':'process','request':request,'connection':connection})
            (args.output/(kind+'-proposal.json')).write_text(json.dumps(proposal,ensure_ascii=False,indent=2)+'\n')
            candidate=proposal['snapshot'];expected=copy.deepcopy(baseline)
            if kind=='title':
                expected['project']['document']['slides'][2]['title']='입력 후 검토합니다'
                assert candidate==expected,'요청한 제목 외의 내용이 바뀜'
            else:
                page=candidate['pages'].get('process');assert page,'본문 표가 없음'
                check_table(page)
                expected['project']['document']['slides'][2]['authored']=True;expected['pages']['process']=page
                assert candidate==expected,'본문 외 제목·노트·다른 장표가 바뀜'
            pending=api('/api/ai/'+path+'state');assert pending==before,'미리보기 전에 원본이 적용됨';record['checks'].append('proposal_does_not_apply')
            applied=api('/api/ai/'+path+'apply',{'token':proposal['token']});record['appliedRevision']=applied['revision']
            assert api('/api/ai/'+path+'state')['snapshot']==candidate,'적용 결과 불일치';record['checks'].append('apply_exact_candidate')
            restored=api('/api/ai/'+path+'restore',{'base':applied['revision'],'revision':state['head']})
            assert restored['revision']!=state['head'] and api('/api/ai/'+path+'state')['snapshot']==baseline,'새 버전으로 원본 복원 실패';record['checks'].append('restore_original_as_new_revision');record['state']='passed'
        except (RuntimeError,AssertionError,ValueError,KeyError) as error:
            record['error']=str(error)
            try:
                current=api('/api/ai/'+path+'state')
                if current['snapshot']!=baseline:
                    api('/api/ai/'+path+'restore',{'base':current['head'],'revision':state['head']})
                    record['cleanupRestored']=api('/api/ai/'+path+'state')['snapshot']==baseline
                else:record['originalPreserved']=True
            except RuntimeError as cleanup_error:record['cleanupError']=str(cleanup_error)
        finally:
            if proposal:
                try:api('/api/ai/'+path+'discard',{'token':proposal['token']})
                except RuntimeError as discard_error:record['discardError']=str(discard_error)
            record['seconds']=round(time.monotonic()-started,1);save();print(json.dumps(record,ensure_ascii=False),flush=True)
        if record['state']=='failed' and kind=='title':break
    save()
    if len(report['cases'])!=len(requests) or any(case['state']!='passed' for case in report['cases']):raise SystemExit(1)


if __name__=='__main__':main()
