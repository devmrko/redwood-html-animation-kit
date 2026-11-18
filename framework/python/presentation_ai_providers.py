"""One JSON generation port for OpenAI-compatible HTTP, OCI CLI and local CLIs."""
import configparser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from .presentation_export import load_env_values,load_settings,request_presentation_json


def parse_json(text):
    if not isinstance(text,str) or len(text)>200000:raise RuntimeError('AI 응답 크기를 확인해 주세요.')
    try:
        value=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip()))
        if not isinstance(value,dict):raise ValueError()
        return value
    except ValueError:raise RuntimeError('AI가 JSON 편집안을 반환하지 않았습니다. 다시 요청해 주세요.') from None


def cli_run(command,*,cwd,input=None,timeout=180):
    # The CLI sees a disposable empty folder, never this project's .env or private assets.
    env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','USER','SHELL','TMPDIR','LANG','LC_ALL','SYSTEMROOT','APPDATA','LOCALAPPDATA','CODEX_HOME','XDG_CONFIG_HOME')}
    try:
        result=subprocess.run(command,cwd=cwd,input=input,text=True,capture_output=True,timeout=timeout,env=env)
    except subprocess.TimeoutExpired:raise RuntimeError('AI 응답 시간이 초과됐습니다. 요청을 줄이고 다시 시도해 주세요.') from None
    except OSError:raise RuntimeError('선택한 CLI를 실행하지 못했습니다. 설치와 로그인을 확인해 주세요.') from None
    if result.returncode:raise RuntimeError('AI CLI 요청이 실패했습니다. 해당 CLI의 로그인·모델·권한 설정을 확인해 주세요.')
    if len(result.stdout)>2000000:raise RuntimeError('AI CLI 응답이 너무 큽니다.')
    return result.stdout


class PresentationAiProviders:
    def __init__(self,root):self.root=Path(root)

    def capabilities(self):
        values=load_env_values(self.root/'.env');settings=load_settings(self.root/'.env')
        config=Path(values.get('OCI_CLI_CONFIG_FILE','~/.oci/config')).expanduser();profiles=[];regions={}
        if config.is_file():
            try:
                parser=configparser.ConfigParser(interpolation=None);parser.read(config)
                profiles=['DEFAULT',*parser.sections()];profiles=list(dict.fromkeys(profiles))
                regions={p:parser.get(p,'region',fallback='') for p in profiles}
            except (configparser.Error,OSError):pass
        return {'openai':{'available':bool(settings['key']),'model':settings['model']},
                'oci':{'available':bool(shutil.which('oci') and profiles),'profiles':profiles,'regions':regions,
                       'profile':values.get('OCI_CLI_PROFILE','DEFAULT'),'region':values.get('OCI_AI_REGION',''),
                       'model':values.get('OCI_AI_MODEL',''),'compartment':values.get('OCI_AI_COMPARTMENT_ID','')},
                'cli':{'available':bool(shutil.which('codex') or shutil.which('claude')),'tools':[n for n in ('codex','claude') if shutil.which(n)]}}

    def generate(self,options,system,content,*,max_tokens=8000):
        if type(max_tokens) is not int or not 1<=max_tokens<=8000:raise ValueError('AI 응답 길이를 확인해 주세요.')
        if not isinstance(options,dict):raise ValueError('AI 연결 방식을 선택해 주세요.')
        provider=options.get('provider');model=options.get('model','')
        if not isinstance(model,str) or len(model)>200 or model.startswith('-'):raise ValueError('모델 이름을 확인해 주세요.')
        model=model.strip()
        if provider=='openai':
            settings=load_settings(self.root/'.env')
            if model:settings['model']=model
            return request_presentation_json(settings,system,content,max_tokens=max_tokens)
        prompt=system+'\n\n'+json.dumps(content,ensure_ascii=False)
        with tempfile.TemporaryDirectory(prefix='presentation-ai-call-') as work:
            if provider=='oci':return self.oci(options,model,system,content,work,max_tokens=max_tokens)
            if provider!='cli' or options.get('tool') not in ('codex','claude'):raise ValueError('지원하지 않는 AI 연결입니다.')
            tool=options['tool'];exe=shutil.which(tool)
            if not exe:raise ValueError('선택한 CLI가 설치돼 있지 않습니다.')
            if tool=='codex':
                output=Path(work)/'answer.json'
                command=[exe,'exec','--ignore-user-config','--ignore-rules','--ephemeral','--sandbox','read-only','--skip-git-repo-check','-C',work,'--color','never','--output-last-message',str(output)]
                if model:command+=['--model',model]
                cli_run([*command,'-'],cwd=work,input=prompt+'\n도구를 사용하지 말고 최종 JSON만 반환하세요.')
                if not output.is_file() or output.stat().st_size>200000:raise RuntimeError('Codex 편집 응답을 읽지 못했습니다.')
                return parse_json(output.read_text())
            command=[exe,'-p','--output-format','json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence']
            if model:command+=['--model',model]
            result=parse_json(cli_run(command,cwd=work,input=prompt))
            if result.get('is_error'):raise RuntimeError('Claude 요청이 실패했습니다. 로그인·모델 설정을 확인해 주세요.')
            return result.get('structured_output') or parse_json(result.get('result',''))

    def oci(self,options,model,system,content,work,*,max_tokens=8000):
        values=load_env_values(self.root/'.env');exe=shutil.which('oci')
        if not exe:raise ValueError('OCI CLI가 설치돼 있지 않습니다.')
        region=options.get('region') or values.get('OCI_AI_REGION','');profile=options.get('profile') or values.get('OCI_CLI_PROFILE','DEFAULT')
        compartment=options.get('compartment') or values.get('OCI_AI_COMPARTMENT_ID','');model=model or values.get('OCI_AI_MODEL','')
        if not re.fullmatch(r'[a-z]{2}-[a-z0-9-]+-\d+',region) or not model or not re.fullmatch(r'ocid1\.(?:compartment|tenancy)\.[A-Za-z0-9_.-]+',compartment):raise ValueError('OCI region·model·compartment OCID를 지정해 주세요.')
        if not isinstance(profile,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',profile) or profile.startswith('-'):raise ValueError('OCI 프로파일을 확인해 주세요.')
        api=options.get('apiFormat','GENERIC');text=json.dumps(content,ensure_ascii=False)
        if api=='GENERIC':request={'apiFormat':'GENERIC','maxTokens':max_tokens,'isStream':False,'messages':[{'role':'SYSTEM','content':[{'type':'TEXT','text':system}]},{'role':'USER','content':[{'type':'TEXT','text':text}]}]}
        elif api=='COHERE':request={'apiFormat':'COHERE','maxTokens':max_tokens,'isStream':False,'preambleOverride':system,'message':text}
        else:raise ValueError('OCI API 형식을 확인해 주세요.')
        payload=Path(work)/'request.json';payload.write_text(json.dumps({'compartmentId':compartment,'servingMode':{'servingType':'ON_DEMAND','modelId':model},'chatRequest':request}))
        config=str(Path(values.get('OCI_CLI_CONFIG_FILE','~/.oci/config')).expanduser())
        command=[exe,'generative-ai-inference','chat-result','chat','--from-json','file://'+str(payload),'--region',region,'--profile',profile,'--config-file',config,'--output','json','--read-timeout','150','--max-retries','0']
        data=parse_json(cli_run(command,cwd=work));response=data.get('data',{}).get('chat-response',{})
        if api=='COHERE':return parse_json(response.get('text',''))
        try:return parse_json(''.join(c.get('text','') for c in response['choices'][0]['message']['content']))
        except (KeyError,IndexError,TypeError):raise RuntimeError('OCI 모델 응답 형식을 확인해 주세요.') from None
