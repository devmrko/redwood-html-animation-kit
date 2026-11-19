# 키트로 만든 사용법 데모

입력·본문 제작·AI 편집·발표·내보내기를 안내하는 11장 자료입니다. 화면은 키트에서 직접 캡처했고, 표·차트·등장 효과는 공통 렌더러로 재생합니다. 그래프의 값은 설명용 예시 데이터입니다.

키트 서버에서 `/examples/usage-demo/open.html`을 열고 **데모 장표 열기**를 누르면 새 복사본을 만듭니다. Python·Git이 필요하며 AI 모델을 호출하지 않습니다.

- `project.json`: 제목·목차·발표 노트·장표 테마
- `pages.json`: 본문 HTML/SVG와 등장 시각
- `screens/`: 실제 UI 캡처. 사진처럼 자산 ID로 본문에 연결
- `watch-template.html`: 녹화 후 MP4·SRT·장표 ZIP을 함께 여는 재생 화면. 목차 시각은 현재 데모 대본 기준

공통 템플릿·재생기·발표자 보기·PPT/영상/SRT 저장은 원래 키트를 그대로 사용합니다. 임의 스크립트 없이 HTML/SVG와 선언형 효과로 본문을 작성한 예제이기도 합니다.

키트 루트에서 `python3 scripts/build_usage_demo.py`를 실행하면 `dist/usage-demo/`에 사진이 포함된 JSON, 본문 JSON, 더블클릭 발표용 HTML이 든 `usage-demo.zip`을 만듭니다. 같은 ID로 직접 수정한 데모가 있으면 덮어쓰지 않고 중단합니다. 새 원본을 시험하려면 `project.json`의 프로젝트 ID를 바꿔 별도 버전으로 만드세요.

장표의 **PPT·영상·SRT**에서 자막 문구와 시간을 확인하고 **영상 만들기**를 누릅니다. 공유 대상으로 현재 내보내기 탭을 선택하고 완료 후 MP4와 SRT를 저장합니다. MP4에는 별도 음성이 없으며 로컬 FFmpeg와 최신 Chrome/Edge가 필요합니다.

생성한 MP4와 SRT를 출력 폴더에 `usage-demo.mp4`·`usage-demo.srt`로 저장하면 같은 폴더의 `watch.html`에서 재생·다운로드합니다. `video-cover.jpg`는 영상에서 추출한 표지 이미지입니다. 대본과 재생 시간을 바꾸면 목차 시각도 맞추세요.
