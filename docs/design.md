# 저장소 구성

실행 화면, 재사용할 공통 코드, 예제, 검사를 분리합니다. 기본 실행은 `python3 start.py`이며 Node.js는 공통 TypeScript를 다시 빌드할 때 사용합니다. 루트 `index.html`은 HTTP에서 애니메이션 샘플, 파일로 열면 더블클릭용 샘플로 연결합니다.

| 위치 | 역할 |
| --- | --- |
| `app/` | 장표 편집·발표·내보내기·AI 화면, 저장소·서버 연결 |
| `framework/src/`, `framework/ui/`, `framework/python/` | 공통 재생·표·SVG·차트·자막·PPT·ZIP 코드의 원본 |
| `vendor/` | 브라우저 실행 모듈과 외부 라이브러리·라이선스 |
| `templates/oracle-corporate.*` | 현재 템플릿의 좌표·글꼴·테마 계약 |
| `templates/legacy/` | 이전 Redwood 2019 스타일의 참고 원본 |
| `examples/animations/`, `examples/components/` | 샘플 원본과 더블클릭용 카탈로그 |
| `examples/usage-demo/` | 사용법 장표·본문·화면 캡처·데모 진입점 |
| `assets/` | 발표에 사용하는 공통 이미지·브랜드 자산 |
| `docs/media/` | README용 사용법 영상·표지·SRT |
| `tests/` | Node/Python 검사와 `browser/` 실제 화면 검사 |
| `scripts/` | 빌드·가져오기·배포·명시적으로 실행하는 모델 시험 도구 |
| `AI/` | 사용자용 Python·AI 연결 시작 파일 |
| `dist/` | 생성한 장표 ZIP·녹화 파일. Git 제외 |

사용자 발표는 `presentation-project.json`에 내용·목차·스크립트를, `pages/`와 루트 `authored-pages.js`에 신뢰하는 페이지 코드와 등록 정보를 둡니다. AI 본문은 `presentation-ai-pages.json`, 로컬 이력은 `.presentation-ai/`에 보관하며 키·이력·개인 자료는 템플릿 Git에 포함하지 않습니다.

## 경로와 이전 주소

HTML 화면은 저장소 루트를 `base`로 사용합니다. 브라우저 모듈의 import는 해당 모듈 위치를 기준으로 합니다. 예를 들어 `app/deck.js`는 `../vendor/foundation/`을 가져오고, 화면의 `./assets/`는 저장소 루트 자산을 가리킵니다.

기존 `/deck.html`, `/builder.html`, `/export.html`, `/samples.html` 등의 HTTP 주소는 `app/legacy-routes.json`에 따라 새 위치로 연결합니다. 쿼리를 보존하며 브라우저가 장표 해시를 전달합니다. 새 링크·문서는 정식 경로를 사용합니다. 파일 배포본의 진입점은 계속 루트 `index.html`입니다.

## 빌드와 배포

`framework/`가 공통 코드의 수정 원본입니다. `npm run build:framework`는 `vendor/foundation/` 실행 파일과 해시, 샘플 카탈로그를 갱신합니다. `vendor/foundation/*.tgz`는 최초 패키지 출처 기록입니다. 샘플 HTML에는 오프라인 실행을 위해 생성 코드를 포함하므로 직접 수정하지 않고 `python3 scripts/build_samples.py`로 갱신합니다.

제작용 ZIP은 `framework/python/presentation_authoring.py`의 명시된 파일·디렉터리만 포함합니다. 앱·공통 원본·라이브러리·현재 템플릿·애니메이션/부품 샘플·제작 지침·필요한 빌드/가져오기 도구와 선택한 발표를 묶습니다. 테스트, 유료 모델 시험, 사용법 데모 재생성 도구·별도 예제는 제외합니다. ZIP의 package 명령도 포함된 파일만 가리킵니다.

완성본 ZIP은 같은 공통 런타임에 등록한 페이지 코드·증거·로컬 영상을 추가하고, 루트 `index.html`에 내용·스타일·모듈을 포함합니다. 해당 ZIP을 따로 풀어 정적 경로 검사와 Python 실행을 검증합니다.
