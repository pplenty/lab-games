# Lab Games Architecture

## 결정

초기 구조는 path 기반과 clean URL로 간다.

- `https://games.jdgrid.com/`
- `https://games.jdgrid.com/brain/`
- `https://games.jdgrid.com/narrative/`
- `https://games.jdgrid.com/brain/games/wordle3/`

현재 게임들은 대부분 정적 HTML/CSS/JS이며, 운영 복잡도를 늘릴 이유가 아직 없다. 한 도메인과 한 배포 파이프라인에서 시작하면 SEO 신호, 분석, 캐시 정책, robots/sitemap 관리도 단순하다.

## Subdomain으로 분리할 기준

아래 조건이 생기면 컬렉션별 서브도메인을 검토한다.

- 별도 백엔드, 인증, DB, 결제 같은 런타임 요구가 생긴다.
- 컬렉션별 배포 주기나 장애 격리가 중요해진다.
- 브랜드를 완전히 분리해야 한다.
- 쿠키, 보안 헤더, 캐시 정책을 컬렉션마다 다르게 가져가야 한다.

그 전까지는 path 기반이 낫다. 예를 들어 `/brain/`에서 충분히 커진 뒤 `brain.games.jdgrid.com`으로 분리해도 되고, 기존 path는 리다이렉트로 유지하면 된다.

## 배포 경계

`public/`만 공개 산출물로 본다. 테스트 코드, 설계 문서, 에이전트 작업 산출물은 공개 디렉터리에 넣지 않는다.

## URL 규칙

공개 URL에는 `.html`을 노출하지 않는다. 정적 파일은 `{slug}/index.html`로 두고, 링크와 sitemap은 항상 trailing slash가 있는 디렉터리 URL을 사용한다.

기존 `.html` 주소는 `public/_redirects`에서 clean URL로 301 이동시킨다.

카테고리는 URL에 넣지 않는다. 게임은 여러 분류에 걸칠 수 있으므로 `/brain/games/{slug}/` 같은 안정적인 주소를 유지하고, 분류는 메타데이터의 다중 태그로 관리한다.

## 게임 추가 규칙

새 컬렉션은 `public/{collection}/` 아래에 둔다. 독립 실행 HTML이면 해당 폴더의 `index.html`에서 작품 목록을 제공한다.

두뇌 게임처럼 다수의 게임 파일을 가진 컬렉션은 다음 구조를 따른다.

```text
public/{collection}/
  index.html
  games.json
  games/
  shared/
```

컬렉션 내부 링크는 가능하면 상대 경로를 유지한다. 그래야 나중에 path 이동이나 서브도메인 분리 시 수정 범위가 줄어든다.
