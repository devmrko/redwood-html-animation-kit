# Redwood HTML 발표 프로젝트

발표 장표의 내용·목차·스크립트·화면을 작성하거나 수정하기 전에 [발표 장표 작성 원칙](authoring/SLIDE_PRINCIPLES.md)을 읽고 적용합니다. 기획 단계부터 적용하고, 전달 전에는 같은 문서의 장표 통과 기준으로 검수합니다.

페이지 제작과 공통 재생·발표자 보기·영상·SRT 인터페이스는 [제작 지침](authoring/AUTHORING.md)을 따릅니다. 템플릿을 유지하고 실제 발표 화면에서 확인합니다.

검사: `npm test`, `node scripts/check.mjs`. 공통 TypeScript 원본을 수정하면 `npm run build:framework`로 브라우저 배포 파일을 갱신합니다. `.env`·키·개인 자료는 커밋하거나 외부에 전송하지 않습니다.
