"""Serve this directory on loopback; no package installation is needed."""
import argparse
import functools
import http.server
import json
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.parse
import webbrowser
import time
import threading
import tempfile
from framework.python.presentation_export import VideoExportJobs, generate_subtitles, load_settings
from framework.python.presentation_document import generate_document_plan
from framework.python.presentation_authoring import create_authoring_bundle, validate_authoring_project
from framework.python.presentation_projects import TemporaryPresentationProjects, PROJECT_ID, MAX_PROJECT_BYTES
from framework.python.presentation_structure import verify_evidence_files,validate_structure
from framework.python.presentation_media import validate_media,verify_media_files


def browser_executable(preference='auto'):
    """Use a Chromium app window; never substitute kiosk or OS fullscreen."""
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ]
        if preference=='chrome':candidates=candidates[1:]
        elif preference=='edge':candidates=candidates[:1]
    else:
        candidates = [shutil.which(name) for name in
                      ("microsoft-edge", "msedge", "google-chrome", "chromium")]
    for candidate in candidates:
        if candidate and pathlib.Path(candidate).is_file():
            return candidate
    raise RuntimeError("Microsoft Edge or Google Chrome is required for a presentation window.")


def presentation_command(origin, payload):
    slide = payload.get("slide", "cover")
    if not isinstance(slide, str) or not re.fullmatch(r"[a-z0-9-]{1,80}", slide):
        raise ValueError("Invalid slide ID")
    def coordinate(key, default, low, high):
        value = payload.get(key, default)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f"Invalid window {key}")
        return value
    width = coordinate("width", 1600, 640, 10000)
    height = coordinate("height", 900, 400, 10000)
    left = coordinate("left", 0, -30000, 30000)
    top = coordinate("top", 0, -30000, 30000)
    project = payload.get('project')
    if project is not None and (not isinstance(project, str) or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', project)):
        raise ValueError('Invalid project ID')
    page = f'/deck.html?project={project}&audience#/{slide}' if project else f'/?audience#/{slide}'
    browser=payload.get('browser','auto')
    if browser not in ('auto','edge','chrome'):raise ValueError('지원하지 않는 앱 브라우저입니다.')
    token=payload.get('launchToken')
    if token is not None:
        if not isinstance(token,str) or not re.fullmatch(r'[a-f0-9]{32}',token):raise ValueError('발표 창 토큰을 확인해 주세요.')
        front,fragment=page.split('#',1);page=front+('&' if '?' in front else '?')+'launchToken='+token+'#'+fragment
    return [browser_executable() if browser=='auto' else browser_executable(browser), f"--app={origin}{page}",
            f"--window-size={width},{height}", f"--window-position={left},{top}"]


class PresentationHandler(http.server.SimpleHTTPRequestHandler):
    launch_lock=threading.Lock()
    def launch_states(self):
        with self.launch_lock:
            if not hasattr(self.server,'presentation_launches'):self.server.presentation_launches={}
            states=self.server.presentation_launches
            for key in list(states):
                if time.monotonic()-states[key]['created']>60:del states[key]
            return states
    def json_response(self, payload, status=200):
        encoded = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def export_jobs(self):
        return self.server.export_jobs

    def source_project(self):
        path=pathlib.Path(self.directory)/'presentation-project.json'
        if not path.exists():return None
        if path.is_symlink() or path.stat().st_size>MAX_PROJECT_BYTES:raise ValueError('발표 원본 JSON 경로·용량을 확인해 주세요.')
        return validate_authoring_project(json.loads(path.read_text()))

    def register_evidence(self,project):
        validate_structure({'document':{'slides':[]},'evidence':project.get('evidence',[])})
        if not hasattr(self.server,'evidence_entries'):self.server.evidence_entries={}
        self.server.evidence_entries.update({e['path']:e for e in project.get('evidence',[])})
        validate_media(project.get('media',[]))
        if not hasattr(self.server,'media_entries'):self.server.media_entries={}
        self.server.media_entries.update({m['path']:m for m in project.get('media',[]) if m['kind']=='file'})

    def serve_media(self,path,head=False):
        try:
            source=self.source_project()
            if source:self.register_evidence(source)
            entry=getattr(self.server,'media_entries',{}).get(path.lstrip('/'))
            if not entry:raise ValueError('등록되지 않은 동영상입니다.')
            file=verify_media_files(self.directory,[entry])[0];size=entry['bytes'];start,end=0,size-1;partial=False
            if self.headers.get('Range'):
                match=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers['Range'])
                if not match or not any(match.groups()):raise ValueError('동영상 범위를 확인해 주세요.')
                if match[1]:start=int(match[1]);end=min(size-1,int(match[2])) if match[2] else size-1
                else:start=max(0,size-int(match[2]))
                if start>=size or end<start or not match[1] and int(match[2])==0:
                    self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
                partial=True
            self.send_response(206 if partial else 200);self.send_header('Content-Type',entry['type']);self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes');self.send_header('Cache-Control','no-cache')
            if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if not head:
                with file.open('rb') as stream:
                    stream.seek(start);remaining=end-start+1
                    while remaining:
                        data=stream.read(min(1024*1024,remaining))
                        if not data:break
                        self.wfile.write(data);remaining-=len(data)
        except (BrokenPipeError,ConnectionResetError):return
        except (OSError,ValueError):self.send_error(404,'Media unavailable or hash mismatch')

    def serve_evidence(self,path,head=False):
        try:
            source=self.source_project()
            if source:self.register_evidence(source)
            entry=getattr(self.server,'evidence_entries',{}).get(path.lstrip('/'))
            if not entry:raise ValueError('등록되지 않은 증거 파일입니다.')
            file=verify_evidence_files(self.directory,[entry])[0]
            self.send_response(200);self.send_header('Content-Type',entry['type']);self.send_header('Content-Length',str(entry['bytes']));self.send_header('Cache-Control','no-cache');self.end_headers()
            if not head:
                with file.open('rb') as data:shutil.copyfileobj(data,self.wfile)
        except (ValueError,OSError):self.send_error(404,'Evidence file unavailable or hash mismatch')

    def do_HEAD(self):
        path=urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if path.startswith('/evidence/'):self.serve_evidence(path,True);return
        if path.startswith('/media/'):self.serve_media(path,True);return
        if any(part.startswith('.') and part!='.env.example' for part in path.split('/')):self.send_error(403);return
        super().do_HEAD()

    def do_GET(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        launch=re.fullmatch(r'/api/presentation-window/status/([a-f0-9]{32})',path)
        if launch:
            state=self.launch_states().get(launch[1])
            self.json_response({'ready':state['ready'],'error':state.get('error')} if state else {'error':'발표 창 요청이 만료됐습니다.'},200 if state else 404)
            return
        if any(part.startswith(".") and part != ".env.example" for part in path.split("/")):
            self.send_error(403)
            return
        if path.startswith('/evidence/'):
            self.serve_evidence(path);return
        if path.startswith('/media/'):
            self.serve_media(path);return
        if path == "/api/export-capabilities":
            try:
                settings = load_settings(pathlib.Path(self.directory) / ".env")
                self.json_response({"ffmpeg": bool(shutil.which("ffmpeg")), "llm": bool(settings["key"]), "model": settings["model"]})
            except (OSError, ValueError):
                self.json_response({"error": ".env 설정 형식을 확인해 주세요."}, 503)
            return
        project = re.fullmatch(r'/api/projects/(' + PROJECT_ID + r')', path)
        if project:
            try:
                source=self.source_project()
                if source and source['document']['id']==project[1]:
                    self.register_evidence(source);encoded=json.dumps(source,ensure_ascii=False).encode()
                else:encoded = self.server.projects.get(project[1])
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(encoded)
            except KeyError:
                self.send_error(404)
            except (ValueError,OSError):self.json_response({'error':'원본 발표 JSON을 확인해 주세요.'},400)
            return
        match = re.fullmatch(r"/api/video-exports/([a-f0-9]{32})(?:/(presentation\.mp4|subtitles\.srt))?", path)
        if match:
            try:
                job_id, name = match.groups()
                if name:
                    file = self.export_jobs().download(job_id, name)
                    self.send_response(200)
                    self.send_header("Content-Type", "video/mp4" if name.endswith(".mp4") else "application/x-subrip; charset=utf-8")
                    self.send_header("Content-Length", str(file.stat().st_size))
                    self.send_header("Content-Disposition", f'attachment; filename="{name}"')
                    self.end_headers()
                    with file.open("rb") as source:
                        shutil.copyfileobj(source, self.wfile)
                else:
                    self.json_response(self.export_jobs().status(job_id))
            except KeyError:
                self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        origin = f"http://127.0.0.1:{self.server.server_port}"
        if self.headers.get("Origin") != origin:
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if self.path=='/api/presentation-window/ready':
                if not 0<length<=2000:raise ValueError('발표 준비 메시지 크기를 확인해 주세요.')
                payload=json.loads(self.rfile.read(length));token=payload.get('launchToken') if isinstance(payload,dict) else None
                if not isinstance(token,str) or not re.fullmatch(r'[a-f0-9]{32}',token):raise ValueError('발표 창 토큰을 확인해 주세요.')
                state=self.launch_states().get(token)
                if not state:raise ValueError('등록된 발표 창 요청이 없습니다.')
                error=payload.get('error')
                if error is not None and (not isinstance(error,str) or len(error)>1000):raise ValueError('준비 오류 형식을 확인해 주세요.')
                state.update(ready=not bool(error),error=error);self.json_response({'received':True});return
            if self.path == '/api/authoring-bundle':
                if not 0 < length <= MAX_PROJECT_BYTES:
                    raise ValueError('프로젝트 JSON은 36MB 이내여야 합니다.')
                self.connection.settimeout(30)
                data=self.rfile.read(length)
                if len(data)!=length:raise ValueError('프로젝트 업로드가 중단됐습니다.')
                bundle=create_authoring_bundle(self.directory,json.loads(data))
                self.send_response(200)
                self.send_header('Content-Type','application/zip')
                self.send_header('Content-Disposition','attachment; filename="presentation-authoring.zip"')
                self.send_header('Content-Length',str(len(bundle)))
                self.send_header('Cache-Control','no-store')
                self.end_headers();self.wfile.write(bundle)
                return
            project = re.fullmatch(r'/api/projects/(' + PROJECT_ID + r')', self.path)
            if project:
                if not 0 < length <= MAX_PROJECT_BYTES:
                    raise ValueError('프로젝트 JSON은 36MB 이내여야 합니다.')
                self.connection.settimeout(30)
                data = self.rfile.read(length)
                if len(data) != length:
                    raise ValueError('프로젝트 업로드가 중단됐습니다.')
                self.server.projects.put(project[1], data)
                value=json.loads(data);self.register_evidence(value)
                source=self.source_project()
                if source and source['document']['id']==project[1]:
                    validate_authoring_project(value)
                    with tempfile.NamedTemporaryFile(dir=self.directory,prefix='.presentation-',suffix='.pending',delete=False) as staging:
                        staging.write(data);staging_path=pathlib.Path(staging.name)
                    staging_path.replace(pathlib.Path(self.directory)/'presentation-project.json')
                self.json_response({'saved': True})
                return
            upload = re.fullmatch(r"/api/video-exports/([a-f0-9]{32})/recording", self.path)
            if upload:
                self.connection.settimeout(30)
                self.export_jobs().upload(upload[1], self.rfile, length)
                self.json_response(self.export_jobs().status(upload[1]), 202)
                return
            if self.path not in ("/api/presentation-window", "/api/subtitles/draft", "/api/video-exports", "/api/presentation-draft"):
                self.send_error(404)
                return
            if not 0 < length <= 256000:
                raise ValueError("Invalid request length")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Expected an object")
            if self.path == "/api/subtitles/draft":
                settings = load_settings(pathlib.Path(self.directory) / ".env")
                self.json_response(generate_subtitles(settings, payload))
                return
            if self.path == '/api/presentation-draft':
                settings = load_settings(pathlib.Path(self.directory) / '.env')
                principles = (pathlib.Path(self.directory) / 'authoring/SLIDE_PRINCIPLES.md').read_text()
                self.json_response(generate_document_plan(settings, payload, principles=principles))
                return
            if self.path == "/api/video-exports":
                job_id = self.export_jobs().create(payload)
                self.json_response(self.export_jobs().status(job_id), 201)
                return
            command = presentation_command(origin, payload)
            token=payload.get('launchToken')
            if token:self.launch_states()[token]={'created':time.monotonic(),'ready':False}
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            response, status = {"launched": True, "opened": False}, 200
        except (ValueError, TypeError) as error:
            response, status = {"error": str(error)}, 400
        except (OSError, RuntimeError) as error:
            response, status = {"error": str(error)}, 503
        except KeyError:
            response, status = {"error": "내보내기 작업을 찾을 수 없습니다."}, 404
        self.json_response(response, status)


def main():
    parser = argparse.ArgumentParser(description="Run the HTML animation samples locally")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent
    handler = functools.partial(PresentationHandler, directory=str(root))
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        raise SystemExit(f"Port {args.port} is unavailable. Try: python3 start.py --port 4174\n{error}") from error
    with server:
        server.export_jobs = VideoExportJobs()
        server.projects = TemporaryPresentationProjects()
        url = f"http://127.0.0.1:{args.port}/"
        source=root/'presentation-project.json'
        if source.is_file():
            if source.stat().st_size>MAX_PROJECT_BYTES:raise SystemExit('프로젝트 JSON은 36MB 이내여야 합니다.')
            project=validate_authoring_project(json.loads(source.read_text()))
            server.projects.put(project['document']['id'],json.dumps(project,ensure_ascii=False).encode())
            url+=f'deck.html?project={project["document"]["id"]}'
        print(f"Open {url}\nStop with Ctrl+C", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.export_jobs.close()


if __name__ == "__main__":
    main()
