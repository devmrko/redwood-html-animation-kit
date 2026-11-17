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
from framework.python.presentation_export import VideoExportJobs, generate_subtitles, load_settings
from framework.python.presentation_document import generate_document_plan
from framework.python.presentation_projects import TemporaryPresentationProjects, PROJECT_ID, MAX_PROJECT_BYTES


def browser_executable():
    """Use a Chromium app window; never substitute kiosk or OS fullscreen."""
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ]
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
    return [browser_executable(), f"--app={origin}{page}",
            f"--window-size={width},{height}", f"--window-position={left},{top}"]


class PresentationHandler(http.server.SimpleHTTPRequestHandler):
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

    def do_GET(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if any(part.startswith(".") and part != ".env.example" for part in path.split("/")):
            self.send_error(403)
            return
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
                encoded = self.server.projects.get(project[1])
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(encoded)
            except KeyError:
                self.send_error(404)
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
            project = re.fullmatch(r'/api/projects/(' + PROJECT_ID + r')', self.path)
            if project:
                if not 0 < length <= MAX_PROJECT_BYTES:
                    raise ValueError('프로젝트 JSON은 36MB 이내여야 합니다.')
                self.connection.settimeout(30)
                data = self.rfile.read(length)
                if len(data) != length:
                    raise ValueError('프로젝트 업로드가 중단됐습니다.')
                self.server.projects.put(project[1], data)
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
                self.json_response(generate_document_plan(settings, payload))
                return
            if self.path == "/api/video-exports":
                job_id = self.export_jobs().create(payload)
                self.json_response(self.export_jobs().status(job_id), 201)
                return
            command = presentation_command(origin, payload)
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            response, status = {"opened": True}, 200
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
