"""Exercise the launch boundary without launching a GUI in the test suite."""
import functools
import http.client
import http.server
import json
from pathlib import Path
import sys
import threading
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from start import PresentationHandler, presentation_command
from framework.python.presentation_projects import TemporaryPresentationProjects


class QuietHandler(PresentationHandler):
    def log_message(self, *args):
        pass


class PresentationWindowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1])))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.projects_temp = tempfile.TemporaryDirectory()
        cls.server.projects = TemporaryPresentationProjects(cls.projects_temp.name)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.projects_temp.cleanup()

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
        self.assertTrue(json.loads(body)["launched"])
        self.assertFalse(json.loads(body)["opened"])
        command = launch.call_args.args[0]
        self.assertIn(f"--app={self.origin}/examples/animations/index.html?audience#/knowledge-flow", command)
        self.assertIn("--window-size=2000,1100", command)
        self.assertIn("--window-position=-2000,0", command)
        self.assertFalse(any("fullscreen" in arg or "kiosk" in arg for arg in command))

    @patch('start.browser_executable',return_value='/browser')
    @patch('start.subprocess.Popen')
    def test_launch_is_not_ready_until_child_acknowledges(self,launch,browser):
        token='a'*32
        status,body=self.request(self.origin,{'slide':'cover','launchToken':token})
        self.assertEqual(status,200);self.assertFalse(json.loads(body)['opened'])
        def state():
            connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port);connection.request('GET','/api/presentation-window/status/'+token)
            response=connection.getresponse();value=json.loads(response.read());connection.close();return value
        self.assertFalse(state()['ready'])
        self.assertEqual(self.request('https://example.test',{'launchToken':token},'/api/presentation-window/ready')[0],403)
        self.assertEqual(self.request(self.origin,{'launchToken':token},'/api/presentation-window/ready')[0],200)
        self.assertTrue(state()['ready'])

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

    def test_secret_files_cannot_be_downloaded(self):
        for path in ('/.env', '/%2eenv', '/.git/config'):
            with self.subTest(path=path):
                connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
                connection.request('GET', path)
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 403)
                connection.close()

    def test_other_origins_cannot_generate_or_create_exports(self):
        for path in ('/api/subtitles/draft', '/api/video-exports', '/api/presentation-draft','/api/authoring-bundle'):
            self.assertEqual(self.request('https://example.com', {}, path)[0], 403)

    def test_authoring_workspace_download_is_a_zip_and_rejects_invalid_projects(self):
        import io
        import zipfile
        value=json.loads((Path(__file__).resolve().parents[1]/'examples/presentation-project.json').read_text())
        status,data=self.request(self.origin,value,'/api/authoring-bundle')
        self.assertEqual(status,200)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:self.assertIn('AGENTS.md',archive.namelist())
        self.assertEqual(self.request(self.origin,{},'/api/authoring-bundle')[0],400)

    @patch('start.generate_document_plan',return_value={'slides':[],'model':'test'})
    def test_draft_route_supplies_current_authoring_principles(self, generate):
        self.assertEqual(self.request(self.origin,{'scenario':'자료를 설명합니다.'},'/api/presentation-draft')[0],200)
        expected=(Path(__file__).resolve().parents[1]/'authoring/SLIDE_PRINCIPLES.md').read_text()
        self.assertEqual(generate.call_args.kwargs['principles'],expected)

    @patch('start.browser_executable', return_value='/browser')
    def test_generated_project_is_preserved_in_presentation_window(self, browser):
        project = '11111111-1111-4111-8111-111111111111'
        command = presentation_command(self.origin, {'slide':'process', 'project':project})
        self.assertIn(f'--app={self.origin}/app/deck.html?project={project}&audience#/process', command)
        with self.assertRaises(ValueError):
            presentation_command(self.origin, {'project':'https://example.com'})

    def test_project_json_is_readable_by_another_browser_without_its_indexeddb(self):
        project = '11111111-1111-4111-8111-111111111111'
        path = '/api/projects/' + project
        body = {'document':{'version':1,'id':project,'slides':[]},'assets':[]}
        self.assertEqual(self.request('https://example.com',body,path)[0],403)
        self.assertEqual(self.request(self.origin,body,path)[0],200)
        connection = http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request('GET',path)
        response=connection.getresponse()
        self.assertEqual(response.status,200)
        self.assertEqual(json.loads(response.read()),body)
        connection.close()

    def test_project_id_mismatch_is_rejected(self):
        path='/api/projects/22222222-2222-4222-8222-222222222222'
        body={'document':{'version':1,'id':'other'},'assets':[]}
        self.assertEqual(self.request(self.origin,body,path)[0],400)


if __name__ == "__main__":
    unittest.main()
