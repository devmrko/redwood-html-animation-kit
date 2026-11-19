# 검사 실행

루트에서 `npm test`로 Node·Python 검사를 실행합니다. 추가 설치가 필요한 브라우저 자동화 도구는 사용하지 않습니다.

실제 효과·탐색·테마·장표 경계 검사는 Python 서버의 `/tests/browser/smoke.html`에서 **검사 실행**을 누릅니다. `?project=<프로젝트 ID>`를 붙이면 해당 AI 본문도 검사하며 결과 JSON을 저장할 수 있습니다. 모델을 호출하지 않습니다.

표는 밝게/어둡게 × 기본/작은 여백 4가지를 추가로 검사합니다. 공통 글자 크기·셀 여백, 이전 `data-tone`과 현재 `data-status`의 색상 호환·우선순위, 표와 하단 이동 버튼의 간격을 확인합니다.

`test_repository_layout.py`는 제작용 ZIP을 따로 풀고 내부 파일만으로 정적 경로와 카탈로그 빌드를 확인합니다. 개발 검사 파일은 사용자 제작용 ZIP에서 제외됩니다. 확인 범위와 실화면 검수 기록은 [검증 범위](../docs/validation.md)를 참조하세요.

파일·독립 ZIP의 발표자 보기와 로컬 영상은 `python3 tests/build_offline_fixture.py`로 공개 합성 자료를 만듭니다. Python 3·FFmpeg가 필요하며 모델을 호출하지 않습니다. 검사 순서는 [배포본 검수 방법](../docs/alpha-roadmap.md#배포본-검수-방법)에 있습니다.

AI 편집 실패·취소는 `python3 tests/serve_ai_editor_fixture.py`를 실행하고 출력 주소를 엽니다. 실제 편집 UI·HTTP·임시 Git 저장소를 사용하며 모델 응답과 캡처 PNG는 합성입니다. 시나리오를 고르고 새 자료를 열어 `Update title`을 요청합니다. 취소·캡처 대기 중 닫기·원본 변경 충돌·생성 실패·저장 중 Escape를 각각 확인하고, 패널을 닫은 뒤 **저장 상태 확인**으로 적용 요청 수·버전 수·제목·대본을 대조합니다. `Ctrl+C`로 종료하면 임시 자료를 정리합니다. 사용자 키나 장표를 사용하지 않습니다.

실제 모델 연결 검사는 서버 실행 후 `python3 scripts/smoke_ai_connections.py --origin http://127.0.0.1:4189 --provider oci --output dist/live-ai-oci-review`로 실행합니다. 새 공개 예제에 제목·표 수정을 요청하고 미적용 원본·적용·새 버전 복원을 대조합니다. `--provider openai` 또는 `--provider cli --tool codex|claude`도 지원합니다. 실제 모델 요금이 발생할 수 있어 `npm test`에 포함하지 않으며 출력 폴더는 새 경로를 사용해야 합니다. 표 검사는 숫자 포함 여부가 아니라 각 행·열의 정확한 값과 공통 클래스를 확인합니다.

화면 크기별 검사는 저장소 루트에서 다음 합성 영상(3초)을 준비하고 Python 서버의 `/tests/browser/layout.html`에서 **전체 검사**를 누릅니다. FFmpeg가 필요하며 실제 모델이나 API 키는 사용하지 않습니다.

```sh
mkdir -p dist/layout/media
ffmpeg -v error -f lavfi -i testsrc2=size=640x360:rate=30 -t 3 -c:v libx264 -pix_fmt yuv420p -an -y dist/layout/media/fixture.mp4
```

실제 공통 렌더러를 5개 iframe 크기 × 2테마 × 2화면 모드 × 8구성으로 검사합니다. **선택 화면 보기**로 사례를 확인하고 결과 JSON을 저장할 수 있습니다. 영상 파일이 없으면 해당 사례를 실패로 표시합니다. 일반 화면의 도구 모음은 실제 HTML/CSS를 사용하지만 클릭 동작·발표자 연결을 검사하는 페이지는 아닙니다. iframe 크기 검사는 실기기·파일 실행 검증을 대체하지 않습니다.

내보내기 실화면 검수용으로 `python3 tests/build_offline_fixture.py --output dist/export-review --export-review`를 사용합니다. FFmpeg가 필요하며 출력 경로는 새 폴더여야 합니다. 6장 자료·차트·긴 대본·3초 합성 영상과 실행본 ZIP, `workspace/` 제작 폴더를 만듭니다. `workspace/`에서 `python3 start.py --no-browser --port 4191`을 실행한 뒤 출력된 프로젝트의 PPT·영상·SRT 화면을 엽니다. PPT는 두 방식을 각각 PowerPoint에서 열고, SRT와 영상의 긴 자막 유지 시간·전환 경계를 대조합니다. MP4 녹화에는 보이는 Chrome/Edge의 현재 탭 공유가 필요합니다.

AI 검증 서버에는 **생성 후 응답 연결 끊김**, **저장 후 응답 연결 끊김**이 있습니다. 후자는 저장 자체가 성공한 뒤 응답만 끊습니다. 실패 안내 뒤 **최신 버전 불러오기**로 결과를 확인하고, 패널을 닫아 적용 요청 1회·버전 2개인지 확인합니다. 같은 적용 요청을 반복하는 검사가 아닙니다. `test_ai_disconnect.py`도 실제 HTTP 연결을 끊고 최신 조회·새 버전 복원을 검사하며 `npm test`에 포함됩니다.

GitHub Actions의 **CI**는 push·pull request·수동 실행마다 Ubuntu 24.04, Node.js 22, Python 3.12에서 잠금 파일 기준 설치 → TypeScript/카탈로그 빌드 → 생성 파일 변경 여부 → Node/Python 테스트 → 링크·구문·해시 검사를 실행합니다. [setup-ffmpeg](https://github.com/federicocarboni/setup-ffmpeg)의 커밋을 고정해 FFmpeg·FFprobe 정적 도구를 설치하고 실제 변환 테스트도 실행하며, AI 키나 제공자 호출은 사용하지 않습니다. 생성 파일을 갱신하지 않은 변경은 실패합니다. 브라우저·PowerPoint 실화면 검사와 Windows 검증은 이 작업에 포함되지 않습니다.
