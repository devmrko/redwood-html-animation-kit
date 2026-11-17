"""Opaque local JSON transfer between browser profiles. Not a durable repository."""
import json
from pathlib import Path
import re
import tempfile
import threading

PROJECT_ID = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
MAX_PROJECT_BYTES = 36 * 1024 * 1024


class TemporaryPresentationProjects:
    def __init__(self, root=None):
        self.root = Path(root or tempfile.mkdtemp(prefix='presentation-projects-'))
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()

    def path(self, project_id):
        if not isinstance(project_id, str) or not re.fullmatch(PROJECT_ID, project_id):
            raise ValueError('프로젝트 ID를 확인해 주세요.')
        return self.root / (project_id.lower() + '.json')

    def put(self, project_id, data):
        path = self.path(project_id)
        if not isinstance(data, bytes) or not 0 < len(data) <= MAX_PROJECT_BYTES:
            raise ValueError('프로젝트 JSON은 36MB 이내여야 합니다.')
        value = json.loads(data)
        document = value.get('document') if isinstance(value, dict) else None
        if not isinstance(document, dict) or document.get('id') != project_id or document.get('version') != 1 or not isinstance(value.get('assets'), list):
            raise ValueError('프로젝트 JSON 형식을 확인해 주세요.')
        with self.lock:
            staging = path.with_suffix('.pending')
            staging.write_bytes(data)
            staging.replace(path)

    def get(self, project_id):
        path = self.path(project_id)
        with self.lock:
            try:
                return path.read_bytes()
            except FileNotFoundError:
                raise KeyError(project_id) from None
