# 검사 실행

루트에서 `npm test`로 Node·Python 검사를 실행합니다. 추가 설치가 필요한 브라우저 자동화 도구는 사용하지 않습니다.

실제 효과·탐색·테마·장표 경계 검사는 Python 서버의 `/tests/browser/smoke.html`에서 **검사 실행**을 누릅니다. `?project=<프로젝트 ID>`를 붙이면 해당 AI 본문도 검사하며 결과 JSON을 저장할 수 있습니다. 모델을 호출하지 않습니다.

표는 밝게/어둡게 × 기본/작은 여백 4가지를 추가로 검사합니다. 공통 글자 크기·셀 여백, 이전 `data-tone`과 현재 `data-status`의 색상 호환·우선순위, 표와 하단 이동 버튼의 간격을 확인합니다.

`test_repository_layout.py`는 제작용 ZIP을 따로 풀고 내부 파일만으로 정적 경로와 카탈로그 빌드를 확인합니다. 개발 검사 파일은 사용자 제작용 ZIP에서 제외됩니다. 확인 범위와 실화면 검수 기록은 [검증 범위](../docs/validation.md)를 참조하세요.

파일·독립 ZIP의 발표자 보기와 로컬 영상은 `python3 tests/build_offline_fixture.py`로 공개 합성 자료를 만듭니다. Python 3·FFmpeg가 필요하며 모델을 호출하지 않습니다. 검사 순서는 [배포본 검수 방법](../docs/alpha-roadmap.md#배포본-검수-방법)에 있습니다.
