import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from framework.python.presentation_export import generate_subtitles, VideoExportJobs


class SubtitleTest(unittest.TestCase):
    def test_provider_receives_body_script_and_real_animation_times(self):
        response = io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps({"captions": [{"start": 2, "end": 4, "text": "본문 기반 자막"}, {"start": 3, "end": 5, "text": "다음 등장"}]})}}]}).encode())
        settings = {"key": "test-key", "model": "test-model", "base_url": "https://example.test/v1"}
        slide = {"title": "제목", "content": "장표 본문 수치 42", "notes": "발표 스크립트", "events": [{"at": 2, "text": "수치 42"}], "duration": 5}
        with patch("urllib.request.urlopen", return_value=response) as call:
            result = generate_subtitles(settings, slide)
        sent = json.loads(json.loads(call.call_args.args[0].data)["messages"][1]["content"])
        self.assertEqual(sent, slide)
        self.assertEqual(result["captions"][0]["start"], 2)
        self.assertEqual(result["captions"][0]["end"], 3)

    def test_invalid_event_never_reaches_provider(self):
        with patch("urllib.request.urlopen") as call:
            with self.assertRaises(ValueError):
                generate_subtitles({"key": "test"}, {"title": "", "notes": "", "duration": 5, "events": [{"at": float('nan'), "text": "bad"}]})
        call.assert_not_called()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
    def test_real_mp4_contains_matching_korean_soft_subtitle_and_srt(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.webm'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=white:s=640x360:r=30','-t','2','-c:v','libvpx-vp9','-y',str(source)],check=True)
            jobs = VideoExportJobs(Path(temp)/'jobs')
            try:
                cue = {"start": .1, "end": 1.9, "text": "검증할 한글 자막"}
                job = jobs.create({"duration": 2, "captions": [cue], "subtitleMode": "soft"})
                shutil.copyfile(source, jobs.root/job/'recording.webm')
                jobs.convert(job)
                self.assertEqual(jobs.status(job)['state'], 'ready')
                mp4 = jobs.download(job, 'presentation.mp4')
                streams = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(mp4)]))['streams']
                video = next(s for s in streams if s['codec_type']=='video')
                self.assertEqual((video['width'], video['height'], video['r_frame_rate']), (1920,1080,'30/1'))
                self.assertTrue(any(s['codec_name']=='mov_text' for s in streams))
                saved = jobs.download(job,'subtitles.srt').read_text()
                embedded = subprocess.check_output(['ffmpeg','-v','error','-i',str(mp4),'-map','0:s:0','-f','srt','-']).decode()
                self.assertIn('00:00:00,100 --> 00:00:01,900',saved)
                self.assertIn(cue['text'], embedded)
            finally:
                jobs.close()


if __name__ == '__main__':
    unittest.main()
