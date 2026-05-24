# Codex Harness

이 저장소는 `games.jdgrid.com`에서 여러 브라우저 게임 컬렉션을 정적으로 서빙한다. Codex는 이 파일을 우선 읽고, 아래 규칙을 기본 작업 계약으로 삼는다.

## Core Rules

- 공개 산출물은 `public/` 아래에만 둔다.
- 공개 URL에는 `.html`을 노출하지 않는다. 게임은 `public/brain/games/{slug}/index.html`처럼 만들고, 링크는 `/brain/games/{slug}/` 형태를 쓴다.
- 카테고리는 URL이 아니라 `public/brain/games.json`의 다중 태그로 관리한다.
- `public/brain/games.json`이 두뇌 게임 목록의 source of truth다. 게임 추가/삭제/이동 시 이 파일과 실제 파일 경로를 함께 맞춘다.
- 테스트 코드, 설계 산출물, 에이전트 작업 로그는 `public/`에 넣지 않는다.
- 기존 사용자 URL을 바꾸는 작업이면 `public/_redirects`에 301 리다이렉트를 추가한다.
- 작업 후 기본 검증은 `npm run verify`다.

## URL And Path Conventions

- Root: `https://games.jdgrid.com/`
- Brain collection: `https://games.jdgrid.com/brain/`
- Brain game: `https://games.jdgrid.com/brain/games/{slug}/`
- Narrative collection: `https://games.jdgrid.com/narrative/`
- Narrative story: `https://games.jdgrid.com/narrative/{slug}/`

두뇌 게임 내부에서 공통 리소스는 다음 상대 경로를 쓴다.

- Game page: `../../shared/core.css`, `../../shared/engine.js`, `injectBackLink('../../')`
- Brain index: `shared/core.css`, `shared/engine.js`
- Brain privacy: `../shared/core.css`

## Adding A Brain Game

1. `npm run context`로 현재 태그와 게임 수를 확인한다.
2. `npm run game:new -- --id {slug} --title "..." --short "..." --tags logic,space`로 파일과 메타데이터를 만든다.
3. 생성된 `public/brain/games/{slug}/index.html`에서 실제 플레이 루프를 구현한다.
4. `public/brain/games.json`의 태그가 `docs/taxonomy.md`의 축과 맞는지 확인한다.
5. `npm run verify`를 통과시킨다.

## Migrating Existing Static Games

- 원본을 그대로 복사하되 공개 파일은 `{slug}/index.html`로 둔다.
- 상대 경로가 한 단계 깊어진다. 기존 `../shared/...`는 보통 `../../shared/...`로 바꿔야 한다.
- `.html` 링크는 남기지 않는다. 예전 주소가 있을 경우 `_redirects`에 추가한다.
- 외부 의존성을 새로 넣기 전에 정적 HTML로 유지 가능한지 먼저 판단한다.

## Design And Product Bias

- 첫 화면은 실제 게임/컬렉션 탐색이어야 한다. 마케팅성 랜딩 페이지를 먼저 만들지 않는다.
- 도메인 특성상 짧은 플레이, 즉시 시작, 모바일 터치 안정성을 우선한다.
- 게임 카드는 한 게임당 하나의 카드만 쓴다. 중첩 카드나 장식용 섹션 카드는 피한다.
- 카테고리는 늘어날 수 있으므로 특정 장르에 URL 구조를 고정하지 않는다.

