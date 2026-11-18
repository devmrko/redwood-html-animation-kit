"""Package a trusted local presentation workspace. No remote-code upload API."""
import argparse
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from framework.python.presentation_release import create_release_bundle

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='완성한 페이지 코드·증거·발표 JSON을 실행 ZIP으로 묶습니다.')
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--manifest',default='presentation-release.json')
    args=parser.parse_args()
    try:print(create_release_bundle(args.root,args.output,args.manifest))
    except (ValueError,OSError) as error:raise SystemExit(str(error)) from None
