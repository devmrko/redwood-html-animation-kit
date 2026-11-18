# 구조화한 장표·증거·동영상 전달하기

본문 코드와 발표 내용을 함께 관리하고, 완성한 페이지를 그대로 전달하는 방법입니다. 먼저 [작성 원칙](../authoring/SLIDE_PRINCIPLES.md)과 [제작 지침](../authoring/AUTHORING.md)을 읽습니다.

## 내용과 페이지 코드

`presentation-project.json`의 문서에는 `purpose`(목적), `audience`(청중), `decision`(판단·다음 행동)을 기록합니다. 장표에는 다음 필드를 선택적으로 사용합니다.

| 필드 | 용도 |
| --- | --- |
| `message` | 장표의 핵심 메시지 |
| `role` | `main`, `detail`, `appendix` |
| `parentId` | 상위 장표 ID. 순환 참조 불가 |
| `data` | 표·수치·그림에 사용할 JSON 객체 |
| `agendaMode` | 전환 간지 `divider` 또는 이동용 목차 `navigation` |
| `evidenceIds`, `mediaIds` | 등록한 증거·영상 ID |

문서의 `appearance`는 `light`·`dark`이며 장표에 같은 필드를 지정하면 해당 장표에 우선 적용합니다. 편집기의 문서 기본 테마·장표 테마 또는 발표 화면의 기본 테마 선택으로 바꿉니다. 밝은·어두운 배경 모두에서 읽히도록 색은 공통 CSS 변수를 사용합니다.

본문은 자유로운 HTML/CSS/SVG 코드로 제작합니다. `renderPage({root, body, slide, data, assets, evidence, media, document})`에서 `data`를 읽고, 같은 내용·수치를 JS에 중복 하드코딩하지 않습니다. 기본 페이지 예제는 `data.type`이 `comparison` 또는 `cost`일 때 공통 표를 사용합니다. 다른 화면 구성은 필요한 코드로 제작합니다. JSON에는 실행 코드나 모듈 경로를 넣지 않습니다.

`presentation-tables.js`의 `createComparisonTable`은 성공·계정 제한·오류·미지원·미시험을 기호와 글자로 구분합니다. `createCostTable`은 금액과 단위·통화·기간·고정/사용량 구분을 표시하며 서로 다른 비용을 임의 합산하지 않습니다. 긴 문장 경고는 검토를 돕는 참고이며 내용 검수를 대신하지 않습니다.

발표 화면의 **전체**, **상위**, 상위 경로로 상세·부록까지 이동합니다. **찾기** 또는 **Ctrl/Cmd+F**는 제목·스크립트·본문 JSON·실제 렌더링 텍스트·증거 설명을 검색합니다. **Ctrl/Cmd+S**는 프로젝트 JSON을 내려받습니다. 추출한 제작 폴더에서는 편집기 변경이 같은 ID의 원본 JSON에도 자동 반영됩니다. 직접 JSON을 수정했다면 브라우저를 새로고침하세요. 서버 코드 변경 때는 서버도 재시작합니다.

## 증거 파일

사진 입력(최대 20개)과 별개로 원본 증거 화면을 최대 500개 등록할 수 있습니다. 파일당 20MB·합계 250MB이고 PNG/JPEG/WebP를 지원합니다.

```sh
python3 scripts/import_evidence.py --root . --directory /path/to/screenshots --kind capture --source '시험 실행 화면' --claim '해당 결과의 근거' --slide process
```

정확한 옵션은 `--help`로 확인합니다. `kind`는 실제 캡처 `capture`, 사후 재열람 `revisit`, 로그 화면 `log`, 모의·재현 `mock` 중 하나입니다. 파일은 `evidence/`에 복사되고 경로·용량·SHA-256·출처가 JSON에 기록됩니다. 공통 본문에는 처음 두 개의 축소본을 표시하며, **증거**에서 전체 목록·원본 확대·해시를 확인합니다. 자유 본문에서는 `createEvidenceFigure(document, evidence.get(id))`로 주장 옆에 직접 배치할 수 있습니다. ZIP과 서버는 실제 파일의 형식·해시를 확인합니다.

## 동영상

본문 장표의 편집 화면에서 **동영상 임베드**를 펼치고 YouTube 주소와 시작·끝 시간을 입력해 연결합니다. 영상은 **불러오기**를 눌러야 YouTube에 접속하며, 자체 컨트롤로 재생합니다. 발표 일시정지나 장표 이동 시 닫히므로 다시 불러오면 지정한 시작 구간부터 재생합니다. 네트워크·제공자의 임베드 허용이 필요합니다.

편집기의 **동영상 배치**에서 영상 우선 자동 배치, 영상을 크게·설명을 좁게 두는 배치, 본문과 같은 폭의 나란히 배치를 고를 수 있습니다. 본문이 없는 장표는 영상만 중앙에 표시합니다. 두 영상은 2열, 세·네 영상은 2×2 격자에 놓고 원본 비율을 유지합니다. 증거는 아래의 작은 영역으로 분리하며 본문을 숨기지 않습니다. 배치는 JSON의 `mediaLayout`(`auto`, `focus`, `balanced`)에 저장합니다. 직접 배치한 자유 본문 영상은 해당 페이지의 구성을 유지합니다.

로컬 영상은 제작 폴더에서 다음과 같이 가져옵니다.

```sh
python3 scripts/import_media.py --root . --slide process --file /path/to/demo.mp4 --start 2 --end 20 --at 1 --title '등록 과정 시연'
```

MP4·WebM, 파일당 100MB·합계 250MB·최대 50개를 지원합니다. `--end`는 필수이며 장표당 최대 네 개, 등장 시점과 구간을 합쳐 최대 600초입니다. 기본은 음소거이고 발표 중 소리가 필요하면 `--sound`로 등록합니다. 코덱 지원은 브라우저에 따릅니다. 실제 길이보다 긴 끝 시간은 화면에 경고하므로 원본 길이에 맞춰 지정하세요.

로컬 파일은 `media/`로 복사하고 해시를 기록합니다. 장표의 재생 시계·속도·탐색에 맞춰 재생하며, 이동·일시정지 시 멈춥니다. 영상 구간만큼 장표 최소 시간을 확보합니다. 자동 배치를 쓰거나 자유 본문에서 `createPresentationMedia(document, media.get(id)).root`를 붙일 수 있습니다. 재생기는 이 요소를 찾아 공통 시계에 연결하므로 별도 타이머를 만들지 않습니다.

현재 MP4 내보내기는 **무음**입니다. 로컬 영상 화면은 녹화하지만 영상 오디오는 포함하지 않습니다. YouTube는 공통 시계로 정확히 녹화하지 않으므로 해당 장표가 선택되어 있으면 MP4 생성을 차단합니다. 로컬 영상으로 교체하거나 장표 선택을 해제하세요. SRT 저장은 사용할 수 있습니다.

## 완성본 ZIP

초안 ZIP은 제작 시작용이고, 완성본은 등록한 페이지 코드·JSON·증거·로컬 영상을 함께 묶습니다.

1. `presentation-release.json`의 `files`에 `authored-pages.js`와 실제 사용한 `pages/`, `styles/`, `data/`, `assets/` 파일을 기록합니다. 코드의 로컬 의존 파일도 포함하세요. 공통 런타임과 등록한 증거·영상은 자동 포함합니다.
2. 모든 페이지·글꼴·원본 확대·발표자 보기·재생과 내보내기를 실제 확인한 뒤 `status`를 `ready`로 바꿉니다. 제작 중에는 `draft`를 유지합니다.
3. 아래 명령으로 완성본을 만듭니다.

```sh
python3 scripts/export_presentation.py --root . --output /tmp/presentation-release.zip
```

새 폴더에 압축을 풀어 `python3 start.py --no-browser`로 재확인합니다. `release-provenance.json`에 원본 manifest의 출처 정보와 페이지 코드·프로젝트 해시가 기록됩니다. `.env`·키·목록에 없는 개인 파일은 포함하지 않습니다. JSON만 저장하면 코드·증거·영상 파일 자체는 전달되지 않습니다.

## 확인 범위

자동 검사는 구조·순환 참조·JSON 보존·31개 증거 등록·파일 해시·완성본 코드 보존·동영상 구간·HTTP 부분 전송·키보드 이벤트를 다룹니다. Chrome 실창 검증에서는 별도 청중 창 준비 확인, 발표자 보기의 앞/뒤 단계 동기화와 1280×800 배치, 로컬 MP4 재생·표/증거와 동시 배치, 검색·Cmd+F·Esc 복귀를 확인했습니다. YouTube 프레임 생성과 일시정지 시 해제는 확인했지만, 시험 영상이 제공자에서 재생 불가로 표시되어 실제 YouTube 재생은 확인하지 못했습니다. 실제 브라우저의 코덱·YouTube 재생·전체 MP4 녹화는 사용 환경에서도 확인해야 합니다. Safari와 모든 다중 모니터 조합을 검증한 것은 아닙니다.

## PPTX 저장

[PPT 저장 방식과 글꼴 조건](../README.md#powerpoint로-저장)을 따릅니다. 공통 `presentation-powerpoint` 모듈은 순서·노트·이미지·기본 PowerPoint 요소를 묶으며, `presentation-powerpoint-editable`은 현재 DOM에서 텍스트·표·기본 SVG 도형을 추출합니다. `presentation-typography`는 영문·한글 글꼴을 나눠 HTML과 같은 기준을 적용합니다. 복잡한 요소를 그림으로 유지하려면 페이지 코드에 `data-ppt-raster`를 지정합니다. 브라우저에서 처리하며 외부 모델이나 변환 서비스로 전송하지 않습니다.
