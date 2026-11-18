# 페이지 제작하기

이 프로젝트는 입력한 발표 내용과 사진, Redwood 템플릿, 발표·영상 내보내기 기능을 포함합니다. Codex나 Claude로 이 폴더를 열고 `REQUEST.md`의 요청대로 페이지를 제작하세요. `pages/*.js`의 기본 본문은 **제작 전 초안**입니다.

기획·작성·검수 전에 [발표 장표 작성 원칙](SLIDE_PRINCIPLES.md)을 읽고 적용하세요. 제품 비교뿐 아니라 설명·제안·교육·결과 보고에도 같은 원칙을 적용하며, 각 장표의 역할에 맞게 검수합니다.

## 첫 실행

Python 3로 `python3 start.py --no-browser`를 실행하고 터미널에 표시된 발표 주소를 엽니다. 포트가 사용 중이면 `--port 4176`처럼 다른 포트를 지정합니다. 추출한 제작 폴더에서 편집한 내용은 같은 프로젝트 ID의 `presentation-project.json`에도 자동 반영합니다. JSON을 직접 편집한 뒤에는 브라우저를 새로고침합니다. 서버 코드 변경 때는 서버도 재시작합니다. JS 수정도 브라우저를 새로고침해 반영합니다.

## 내용과 화면

- `presentation-project.json`: 제목, 섹션·목차, 핵심 내용 `items`, 발표 스크립트 `notes`, 사진 자산과 페이지별 제작 요청 `design`을 관리합니다. 사실·수치를 임의로 만들지 마세요.
- `pages/<장표ID>.js`: 해당 페이지의 본문을 HTML·CSS·SVG·JavaScript로 작성합니다. 표·그림·차트·도식·다양한 효과를 내용에 맞게 구성하세요. 외부 라이브러리나 새 의존성은 필요한 이유가 있을 때만 추가합니다.
- `authored-pages.js`: 프로젝트 ID와 장표 ID를 페이지 모듈에 연결합니다. JSON에는 실행할 코드나 모듈 경로를 넣지 않습니다. 장표를 추가하면 등록도 갱신합니다.
- `template-theme.js`, `templates/oracle-corporate.css`, `templates/oracle-corporate.json`: 표지·간지·마지막 장, 글꼴·색상·제목·본문 좌표의 기준입니다. 본문은 1400×560 CSS px이고 슬라이드는 1600×900입니다. 제공된 디자인을 유지하세요.
- `framework/src`, `vendor/foundation`: 공통 원본과 브라우저 런타임입니다. 페이지마다 재생·자막·영상 기능을 다시 만들지 않습니다. 공통 원본을 바꿨다면 TypeScript로 빌드하고 `node scripts/sync-ui.mjs`로 배포 파일을 갱신하세요.

영문·숫자는 원본 템플릿의 Oracle Sans Tab을 우선합니다. 한글은 같은 글꼴 집합의 대체 글꼴(Mac: Apple SD Gothic Neo, Windows: Malgun Gothic)을 사용합니다. 페이지 코드에서 별도 글꼴을 하드코딩하지 마세요. 본문 24px 이상, 도식 라벨 22px 이상을 우선하고 복잡한 내용은 문구·배치를 정리하거나 장표를 나눕니다. 로고를 글자로 흉내 내지 말고 제공된 공식 SVG를 사용하세요. 사진은 `assets` 맵의 ID로 참조합니다. HTML 전체를 이미지로 굽지 말고 텍스트·표·도식은 DOM·SVG로 만들어 확대 시 선명하게 유지하세요.

표·숫자·페이지별 내용은 `slide.data`(인수 `data`)에서 읽고 JS에 중복 하드코딩하지 않습니다. 구조·상위 장표·증거·동영상·완성본 ZIP은 [작업별 제작 계약](../docs/presentation-workspace.md)을 읽고 적용합니다. 사용자 요청에 맞는 자유 본문을 제작하며 공통 표·증거·영상 부품은 필요한 경우 사용합니다.

문서 `appearance`는 `light` 또는 `dark`이고, 장표의 `appearance`가 있으면 그 장표에 우선 적용합니다. 본문 색은 `--rf-text`, 배경은 `--rf-bg`·`--rf-surface`, 강조는 `--rf-accent`를 사용해 두 테마에서 읽히게 작성합니다.

## 페이지 인터페이스

`renderPage({root, body, slide, data, assets, evidence, media, document})`가 `{player, stepTimes?}`를 반환합니다. `body` 안에 화면을 만들고 머리말·로고·바닥글은 공통 템플릿에 맡깁니다. `assets.get(slide.imageId)`는 사진의 `dataUrl`·이름을 제공합니다.

`player`는 공통 `createPresentationTimeline` 또는 같은 인터페이스를 구현한 재생기입니다. `play/pause/restart/finish/seek/setPlaybackRate/destroy`, `state/currentTime`, `describe()`를 제공해야 합니다. `describe()`는 초 단위의 `{duration, events:[{at,text}]}`를 반환합니다. 효과 등장 시점과 실제 내용을 연결해야 자막과 영상 재생시간에 반영됩니다. SVG도 같은 시계로 움직이세요. 독립적인 CSS 무한 애니메이션이나 별도 타이머는 사용하지 않습니다.

`stepTimes`는 이전·다음 버튼으로 이동할 시각(초)을 오름차순으로 지정합니다. 해당 시각에 설명할 요소가 충분히 보이도록 정합니다. 단계가 없는 화면은 생략할 수 있습니다. `finish()`에서는 모든 필요한 정보가 보이고 `seek()` 후에도 빈 화면이나 잔상이 없어야 합니다.

## 검수와 전달

먼저 [장표 통과 기준](SLIDE_PRINCIPLES.md#장표-통과-기준)으로 제목·핵심 내용·근거·조건·가독성을 확인합니다.

1. 시나리오의 요구와 각 페이지의 실제 내용을 대조합니다. 표·사진·도식의 표현이 요청과 맞는지 확인합니다.
2. 표지·목차 간지·본문·마지막 장을 모두 열어 글꼴·로고·여백과 잘림·겹침·읽기 크기를 확인합니다. 제작 전 초안 표시는 완성한 페이지에서 제거합니다.
3. 재생·일시정지·다시 재생·단계 이동을 확인합니다. 발표 시작의 별도 창과 발표자 보기에 실제 페이지·스크립트가 나오는지 확인합니다.
4. PPT·영상·SRT 화면에서 본문 추출·노트·등장 시점·최소 시간을 확인하고 SRT를 내려받습니다. FFmpeg와 브라우저 녹화가 가능하면 짧은 MP4를 실제 생성해 프레임도 확인합니다.
5. PPT를 화면 유지형·편집형으로 각각 저장합니다. PowerPoint에서 제목·표·도형·발표 노트, 글꼴·줄바꿈·잘림을 확인합니다. 편집형의 복잡한 그래픽·캔버스는 그림으로 남으며, `data-ppt-raster`로 지정한 요소도 그림으로 유지합니다.
6. 수정한 파일과 실제 확인한 범위, 확인하지 못한 항목을 보고합니다. 페이지 스크린샷을 함께 제공합니다. Git 커밋·푸시는 사용자의 요청에 따릅니다.

완성본은 이 폴더 전체를 보관하거나, 검수 후 `presentation-release.json`을 `ready`로 바꾸고 `python3 scripts/export_presentation.py --root . --output /tmp/presentation-release.zip`으로 코드·증거·영상이 포함된 실행본을 만드세요. JSON 저장은 내용과 사진을 옮기며, 페이지 JS 코드까지 포함하지는 않습니다. 자막 LLM 기능은 선택 사항이며 사용할 때만 `.env.example`을 보고 키를 설정합니다.
