"""Serve this directory on loopback; no package installation is needed."""
import argparse
import functools
import http.server
import pathlib
import webbrowser


def main():
    parser = argparse.ArgumentParser(description="Run the HTML animation samples locally")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
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
