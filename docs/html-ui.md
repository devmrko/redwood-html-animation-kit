# HTML 디자인 부품 재사용하기

장표·웹 화면·Python 템플릿에서 버튼·카드·입력의 모양을 같은 클래스로 사용합니다.
Redwood 화면과 CSS 변수 구성을 참고한 자체 구현입니다. Oracle JET 런타임·전용 이미지·폰트는 포함하지 않습니다.

## CSS와 HTML만 사용

npm 앱은 CSS를 import합니다.

```js
import '@devmrko/react-foundation-core/ui.css';
```

정적 HTML 또는 Python/Jinja 앱은 패키지의 `ui/` 디렉터리를 static 자산으로 복사하거나
배포 과정에서 추출하고, ui.css를 연결합니다. 세 CSS 파일을 함께 배포해야 합니다.

```html
<link rel="stylesheet" href="/static/foundation/ui/ui.css">
<body class="rf-theme">
  <article class="rf-card">
    <header class="rf-card__header"><h2 class="rf-card__title">업무 지식</h2></header>
    <div class="rf-card__body">{{ description }}</div>
    <footer class="rf-card__footer"><button type="button" class="rf-button rf-button--primary">확인</button></footer>
  </article>
</body>
```

Jinja에서는 autoescape를 켜고 일반 변수를 사용합니다. 외부 HTML에 safe 필터를 적용하지 않습니다.
공통 CSS를 편집하지 말고 앱에서 `.rf-theme { --rf-accent: #227e9e; }`처럼 변수를 덮어씁니다.
선택 색은 청색, 기본 동작은 진한 버튼, 상태는 배지의 텍스트와 색으로 구분합니다.

## HTML 구성

| 구성 | 공통 클래스 |
| --- | --- |
| 테마·레이아웃 | rf-theme, rf-stack, rf-inline, rf-grid |
| 페이지 제목·도구 | rf-page-header, rf-page-header__title, rf-page-header__description, rf-toolbar |
| 버튼 | rf-button, rf-button--primary, rf-button--quiet |
| 카드 | rf-card, rf-card__header, rf-card__title, rf-card__body, rf-card__footer |
| 입력 | rf-field, rf-field__label, rf-input, rf-field__hint, rf-field__error |
| 배지 | rf-badge, rf-badge--info/success/warning/danger |
| 알림 | rf-notice, rf-notice--success/warning |
| 목록 | rf-list, rf-list__row, aria-current="true" |
| 접기 | native details + rf-details |

입력은 label for/id, 도움말은 aria-describedby, 오류는 aria-invalid로 연결합니다.
중복 id를 만들지 않습니다. 선택 버튼은 aria-pressed를 사용합니다.
버튼은 기본 44px 이상, 입력은 48px 이상입니다. 테마 기본색은 라이트만 제공합니다.

## 선택적 DOM 함수

```js
import { createUiButton, createUiCard, createUiField, createUiBadge } from '@devmrko/react-foundation-core';
const field = createUiField(document, { id: 'project-name', label: '프로젝트 이름', required: true });
const card = createUiCard(document, {
  title: '설정', content: field.element,
  actions: [createUiButton(document, { label: '저장', variant: 'primary' })],
});
container.append(card);
```

함수는 새 요소만 생성하며 명시적으로 append하기 전에는 화면을 바꾸지 않습니다.
텍스트는 textContent로 처리합니다. 카드 content/actions로 받은 Node는 복제하지 않고 이동합니다.
이벤트와 전송·저장은 소비 앱이 연결합니다. Python 패키지에 설치 연결하는 별도 API는 이번 범위에 없습니다.

참고: [Redwood](https://redwood.oracle.com/),
[JET CSS Variables](https://docs.oracle.com/en/middleware/developer-tools/jet/15/reference-styling/CssVariablesOverview.html).
2026-11-13 화면과 변수 구조를 참고했으며 rf-*는 공식 JET API와 호환되는 이름이 아닙니다.

## 글꼴·크기 규칙

JET는 역할별 타이포그래피 변수를 제공합니다. 2026-11-13 redwood.oracle.com의 런타임 변수에서
heading lg/md/sm은 32/28/24px, body lg/md는 18/16px(루트 16px 기준)을 확인했습니다.
웹사이트의 실제 글꼴 변수는 시스템 sans-serif 스택이었습니다. 제품마다 테마가 달라질 수 있습니다.

이 모듈은 다음 역할을 사용합니다. 14px 보조문구·12px 캡션과 한글 본문 줄간격 1.6은
이 프로젝트에서 정한 값이며 Redwood 전체에 적용되는 필수 최소값이라는 뜻은 아닙니다.

| 클래스 | 기본 크기 | 용도 |
| --- | --- | --- |
| rf-title | 32px | 화면 제목 |
| rf-heading | 24px | 섹션 제목 |
| rf-subheading | 20px | 카드 제목 |
| rf-body-lg | 18px | 강조 본문 |
| rf-body | 16px | 기본 본문 |
| rf-small | 14px | 보조 설명 |
| rf-caption | 12px | 비핵심 캡션 |

굵기는 400/600/700, 제목 줄간격 1.3, 본문 1.6입니다. 본문을 캡션 크기로 줄이지 않습니다.
입력은 최소 16px로 설정합니다. rem 기반이라 사용자의 브라우저 기본 글꼴 확대를 따릅니다.
`--rf-font`는 시스템 글꼴을 기본으로 하고 앱이 로컬 또는 적법하게 공급한 웹폰트를 지정할 수 있습니다.
특정 Oracle 폰트 파일은 포함하지 않습니다. 한글 fallback은 Apple SD Gothic Neo/Malgun Gothic입니다.

장표는 별도 1600×900 좌표계에서 제목40/카드제목30/소제목24/본문24/보조18px를
`--rf-slide-*`로 관리합니다. Reveal 화면 축소 후 실제 표시 크기는 이보다 작아집니다.
일반 웹 화면의 16px 최소와 같은 것으로 보장하지 않습니다. 장표 글자 크기를 조정할 때는
레이아웃과 투사 화면에서도 다시 확인합니다.

참고: [JET Typography CSS 변수](https://docs.oracle.com/en/middleware/developer-tools/jet/13/reference-styling/CSSVariables.html),
[JET Text 클래스](https://docs.oracle.com/en/middleware/developer-tools/jet/20/reference-api/Text.html).

## 제공된 발표 템플릿 참조

사용자가 제공한 `Redwood PPT Template 090319 (1).potx`의 slide2/3/4, 마스터와
본문 레이아웃13/14/16을 2026-11-13 직접 확인했습니다. 이 파일의 일반 본문 장표 제목은
Oracle Sans Bold24pt, 본문18pt이고, 마스터의 큰 제목은 Georgia44pt입니다.
본문/표지마다 크기가 다르므로 앞의 웹 UI16px 규칙과 혼동하지 않습니다.
`rf-slide`는 1600×900 HTML 좌표계, 좌우100px(6.25%) 여백과40px 제목을 사용합니다.
기본 본문24px/표본 설명20px는 많은 클릭 표본을 표시하기 위한 앱 조정값입니다.
원본 템플릿의 전체 서식을 동일하게 복제한 것은 아닙니다. Oracle Sans가 없으면 한글 시스템 글꼴로 대체됩니다.
폰트 파일은 포함하지 않습니다. 원본을 수정하지 않고 상단 패턴/Oracle 표식만 소비 앱 자산으로 추출했습니다.
브랜드 자산의 출처/배포 조건은 소비 앱에서 관리합니다.

목차는 rf-sidebar/rf-sidebar__item으로 표시하고 aria-current="page"로 선택 상태를 나타냅니다.
전체 화면은 `createFullscreenControl({target:document.documentElement,button,onChange,onError})`로 연결합니다.
실제 사용자 클릭에서 호출해야 하며 성공은 fullscreenchange 상태로 확인합니다. Esc로 종료합니다.
일부 브라우저의 '전체 화면에서 툴바 항상 표시' 옵션은 웹 CSS로 숨길 수 없습니다.

`createPresentationChart({root,type,title,data})`는 bar/line/donut SVG와 tracks를 반환합니다.
data는 [{label,value}]이고 비음수·유한값만 허용합니다. 항목은 최대12개, 도넛은 최대5개이며 합0은 거부합니다.
tracks를 기존 createPresentationTimeline에 전달합니다. 데이터 변경 시 재생기 destroy 후 차트를 destroy하고 새로 만듭니다.
SVG aria-label은 원래 데이터값을 포함합니다. 통계 검증·실시간 수신·축 단위 추론은 하지 않습니다.
