import json
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from framework.python.presentation_document import generate_document_plan


class DocumentPlanTest(unittest.TestCase):
    def test_provider_gets_scenario_and_image_names_without_image_data(self):
        slide = {'layout':'photo','section':'소개','title':'자료 소개','subtitle':'','items':['등록한 자료'],'notes':'자료를 소개합니다.','imageId':'photo-1'}
        response = io.BytesIO(json.dumps({'choices':[{'message':{'content':json.dumps({'slides':[slide]})}}]}).encode())
        settings={'key':'test-key','model':'test-model','base_url':'https://example.test/v1'}
        with patch('urllib.request.urlopen', return_value=response) as call:
            result=generate_document_plan(settings, {'scenario':'자료를 소개합니다.','images':[{'id':'photo-1','name':'자료.png','dataUrl':'NEVER-SEND'}]},principles='제목에 핵심 메시지를 쓰고 상세보기 없이 핵심 내용을 보여준다.')
        sent=json.loads(call.call_args.args[0].data)
        self.assertNotIn('NEVER-SEND',json.dumps(sent))
        self.assertIn('제목에 핵심 메시지를 쓰고 상세보기 없이 핵심 내용을 보여준다.',sent['messages'][0]['content'])
        content=json.loads(sent['messages'][1]['content'])
        self.assertEqual(content['images'],[{'id':'photo-1','name':'자료.png'}])
        self.assertEqual(result['slides'],[slide])

    def test_unknown_image_reference_is_rejected(self):
        slide={'layout':'photo','title':'제목','items':[],'imageId':'missing'}
        with patch('framework.python.presentation_document.request_presentation_json',return_value={'slides':[slide]}):
            with self.assertRaises(RuntimeError):
                generate_document_plan({'model':'test'},{'scenario':'시나리오'})

    def test_empty_scenario_does_not_call_provider(self):
        with patch('framework.python.presentation_document.request_presentation_json') as call:
            with self.assertRaises(ValueError):
                generate_document_plan({}, {'scenario':''})
            call.assert_not_called()

    def test_empty_body_is_rejected_and_missing_notes_use_the_actual_items(self):
        with patch('framework.python.presentation_document.request_presentation_json',return_value={'slides':[{'layout':'content','title':'제목','items':[],'imageId':None}]}):
            with self.assertRaises(RuntimeError):
                generate_document_plan({'model':'test'},{'scenario':'입력한 내용'})
        with patch('framework.python.presentation_document.request_presentation_json',return_value={'slides':[{'layout':'content','title':'제목','items':['실제 본문'],'notes':'','imageId':None}]}):
            result=generate_document_plan({'model':'test'},{'scenario':'입력한 내용'})
        self.assertEqual(result['slides'][0]['notes'],'실제 본문')


if __name__ == '__main__':
    unittest.main()
