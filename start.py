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
import webbrowser


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
    return [browser_executable(), f"--app={origin}/?audience#/{slide}",
            f"--window-size={width},{height}", f"--window-position={left},{top}"]


class PresentationHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        origin = f"http://127.0.0.1:{self.server.server_port}"
        if self.path != "/api/presentation-window":
            self.send_error(404)
            return
        if self.headers.get("Origin") != origin:
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024:
                raise ValueError("Invalid request length")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Expected an object")
            command = presentation_command(origin, payload)
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            response, status = {"opened": True}, 200
        except (ValueError, TypeError) as error:
            response, status = {"error": str(error)}, 400
        except (OSError, RuntimeError) as error:
            response, status = {"error": str(error)}, 503
        encoded = json.dumps(response).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


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
        url = f"http://127.0.0.1:{args.port}/"
        print(f"Open {url}\nStop with Ctrl+C", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
