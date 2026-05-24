# Codex Harness

이 하네스의 목적은 Codex가 매번 같은 판단을 반복하지 않고, 게임 추가와 이관 작업을 빠르게 끝내도록 하는 것이다.

## Fast Path

```bash
npm run context
npm run game:new -- --id sample-game --title "샘플 게임" --short "짧은 설명" --tags logic,focus
npm run verify
```

## Components

- `AGENTS.md`: Codex가 지켜야 할 프로젝트 규칙
- `tools/context.mjs`: 현재 게임 수, 카테고리, 주요 명령 요약
- `tools/scaffold-brain-game.mjs`: clean URL 구조와 `games.json` 등록 자동화
- `tools/check-site.mjs`: 공개 파일, 메타데이터, 내부 링크, clean URL 검증
- `tools/build-sitemap.mjs`: `games.jdgrid.com` 기준 sitemap 생성
- `docs/taxonomy.md`: 태그 축과 확장 기준

## Task Packets

### Add Brain Game

요청 형식:

```text
brain 게임 하나 추가해줘.
slug: ...
title: ...
core loop: ...
tags: ...
```

Codex 처리 순서:

1. `npm run context`
2. `npm run game:new -- --id ... --title ... --short ... --tags ...`
3. 게임 로직 구현
4. `npm run verify`

### Migrate Static Game

요청 형식:

```text
../somewhere/game.html을 /brain/games/{slug}/로 옮겨줘.
```

Codex 처리 순서:

1. 원본 파일과 의존 리소스 확인
2. `public/brain/games/{slug}/index.html`로 이관
3. 상대 경로와 홈 링크 수정
4. `games.json` 등록
5. 필요 시 `_redirects` 추가
6. `npm run verify`

### Review Site

요청 형식:

```text
배포 전에 구조와 링크 깨짐 리뷰해줘.
```

Codex 처리 순서:

1. `npm run verify`
2. `rg`로 `.html` 공개 링크, placeholder, 오래된 도메인 확인
3. sitemap과 robots 확인
4. 발견 사항을 파일/라인 기준으로 보고

## Done Criteria

- 새 공개 URL이 `.html` 없이 동작한다.
- `games.json`의 `path`가 실제 파일과 일치한다.
- 모든 태그가 등록된 카테고리다.
- sitemap에 `https://games.jdgrid.com/...` clean URL만 들어간다.
- `npm run verify`가 통과한다.

