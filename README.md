# Lab Games

`games.jdgrid.com`에서 여러 게임 컬렉션을 서빙하기 위한 정적 사이트 저장소.

## 구조

```text
public/
  index.html              # games.jdgrid.com
  site.css                # 루트/컬렉션 공통 스타일
  brain/                  # games.jdgrid.com/brain/
  narrative/              # games.jdgrid.com/narrative/
docs/
  codex-harness.md       # Codex 작업 하네스
  architecture.md         # path 기반 운영 결정과 확장 기준
  taxonomy.md             # 카테고리와 태그 운영 기준
tools/
  context.mjs
  scaffold-brain-game.mjs
  build-sitemap.mjs
  check-site.mjs
```

## 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:4173`을 열면 된다.

## Codex 하네스

```bash
npm run context
npm run game:new -- --id sample-game --title "샘플 게임" --short "짧은 설명" --tags logic,focus
npm run verify
```

- `AGENTS.md`: Codex가 우선 따라야 할 작업 규칙
- `docs/codex-harness.md`: 게임 추가, 이관, 리뷰 작업 패킷
- `npm run verify`: sitemap 생성과 정적 검증을 함께 실행

## 배포

정적 호스팅의 출력 디렉터리는 `public`으로 설정한다.

- Production domain: `games.jdgrid.com`
- Build command: `npm run build`
- Output directory: `public`

## 현재 컬렉션

- `/brain/`: `../game-test/brain`에서 이관한 두뇌 퍼즐 모음
- `/narrative/`: `../game-test/narrative`에서 플레이 가능한 단편 HTML 2개만 공개

공개 URL은 `.html`을 노출하지 않는다. 예: `/brain/games/wordle3/`, `/narrative/mailbox/`.
