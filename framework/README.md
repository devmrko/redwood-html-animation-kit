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
HTML 내용과 페이지별 타이밍은 `index.html`과 `slides/`에서 수정합니다.
