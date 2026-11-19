# 공통 프레젠테이션 모듈

Foundation의 프레젠테이션 관련 원본을 배포용으로 포함합니다. 앱은 `vendor/foundation/*.js`를 소비합니다.

- `src/`: 깊이·재생기·효과·텍스트/SVG·차트·전체 화면·DOM 부품
- `ui/`: `rf-*` 공통 클래스와 `--rf-*` 테마 변수

공통 기능을 수정할 때는 이 원본을 바꾸고 저장소 루트에서 실행합니다.

```sh
npm ci
npm run build:framework
npm run check
```

`vendor/foundation/*.tgz`는 최초 Foundation 패키지의 기록입니다. 로컬 원본을 수정한 뒤 다시 빌드하면 브라우저 모듈이 갱신되고 manifest에 재빌드 상태가 기록됩니다.
HTML 내용과 페이지별 타이밍은 `examples/animations/index.html`과 `examples/animations/slides/`에서 수정합니다.

영상 기능은 `presentation-context`(본문·등장 시각·최소 시간), `presentation-subtitles`(읽기 시간·재생 계획·SRT), `presentation-video`(탭 영역 녹화), `presentation-window`(발표 창 제어) 모듈을 사용합니다. DOM과 무관한 자막 계획은 다른 앱에서도 사용할 수 있습니다. `python/presentation_export.py`는 환경 설정·OpenAI 호환 초안·FFmpeg 변환을 담당하며 HTTP 연결은 앱의 `start.py`가 담당합니다. 새 동작은 공통 원본을 수정하고 앱에서는 내용과 연결을 주입합니다.

시나리오 생성기는 `presentation-document`의 버전 1 JSON 계약을 사용합니다. `createDocumentFromScenario`는 기본 구성을 만들고 `validatePresentationProject`는 문서·사진 참조·형식을 검증합니다. `presentation-document-view`는 프로젝트와 DOM 마운트·테마를 받아 공통 재생기를 만듭니다. `presentation-project-store`는 IndexedDB 저장에 선택형 transport를 주입받습니다. HTTP 주소는 앱의 `app/project-store.js`가 연결합니다.

```js
import {validatePresentationProject, renderPresentationDocument} from './vendor/foundation/index.js';
import {presentationTheme, projectSections} from './app/template-theme.js';
const response = await fetch('./examples/presentation-project.json');
const project = validatePresentationProject(await response.json());
// 페이지에서 vendor/foundation/ui/ui.css와 templates/oracle-corporate.css를 로드합니다.
const deck = renderPresentationDocument(project, document.querySelector('.slides'), presentationTheme,
  {sections: projectSections(project.document)});
deck.slides[0].player.play();
// 호스트는 자신의 페이지 전환기에 연결하고 종료 시 deck.destroy()를 호출합니다.
```

JSON은 제목·목차·핵심 내용·스크립트·사진·제작 요청을 관리합니다. 실제 페이지는 신뢰하는 로컬 모듈에서 작성하고 호스트가 `DocumentRenderOptions.pages`로 주입합니다. 페이지 팩터리는 `{root,body,slide,assets,document}`를 받아 `{player,stepTimes?}`를 반환합니다. `player.describe()`의 내용·등장 시각은 공통 자막·시간 계산에 연결됩니다. JSON의 `authored:true` 페이지에 등록된 코드가 없으면 오류로 표시합니다. JSON에는 실행할 모듈 경로를 넣지 않습니다.

Python의 `presentation_document`는 선택형 내용 정리, `presentation_authoring`은 제작용 프로젝트 ZIP, `presentation_projects`는 브라우저 간 임시 프로젝트 전달을 담당합니다. ZIP은 호스트의 명시된 런타임 파일과 선택한 프로젝트만 포함합니다. 템플릿·키·HTTP 경로는 호스트가 소유합니다. 제작·검수 계약은 [페이지 제작 지침](../authoring/AUTHORING.md)을 참조하세요.
