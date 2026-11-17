"""Exercise the launch boundary without launching a GUI in the test suite."""
import functools
import http.client
import http.server
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from start import PresentationHandler, presentation_command


class QuietHandler(PresentationHandler):
    def log_message(self, *args):
        pass


class PresentationWindowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1])))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, origin, payload, path="/api/presentation-window"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request("POST", path, json.dumps(payload), {"Origin": origin, "Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    @patch("start.browser_executable", return_value="/browser")
    @patch("start.subprocess.Popen")
    def test_window_launch_preserves_slide_and_uses_app_not_fullscreen(self, launch, browser):
        status, body = self.request(self.origin, {"slide": "knowledge-flow", "width": 2000, "height": 1100, "left": -2000})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["opened"])
        command = launch.call_args.args[0]
        self.assertIn(f"--app={self.origin}/?audience#/knowledge-flow", command)
        self.assertIn("--window-size=2000,1100", command)
        self.assertIn("--window-position=-2000,0", command)
        self.assertFalse(any("fullscreen" in arg or "kiosk" in arg for arg in command))

    @patch("start.subprocess.Popen")
    def test_other_origins_cannot_open_windows(self, launch):
        self.assertEqual(self.request("https://example.com", {})[0], 403)
        launch.assert_not_called()

    @patch("start.subprocess.Popen")
    def test_invalid_payloads_do_not_open_windows(self, launch):
        for payload in [[], {"slide": "https://example.com"}, {"slide": "cover --kiosk"}, {"width": "2000"}, {"height": 100000}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.request(self.origin, payload)[0], 400)
        launch.assert_not_called()

    @patch("start.browser_executable", side_effect=RuntimeError("Browser unavailable"))
    @patch("start.subprocess.Popen")
    def test_missing_browser_reports_failure(self, launch, browser):
        self.assertEqual(self.request(self.origin, {})[0], 503)
        launch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
