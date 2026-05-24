# Game Taxonomy

게임 종류를 미리 확정하기 어렵기 때문에 카테고리는 폴더 구조가 아니라 메타데이터 태그로 관리한다.

## 원칙

- URL은 컬렉션과 게임 slug만 담는다: `/brain/games/wordle3/`
- 한 게임은 여러 태그를 가질 수 있다.
- 태그는 필터, 추천, sitemap 우선순위, 큐레이션에 쓴다.
- 새 게임이 기존 분류에 맞지 않으면 태그를 추가한다. 기존 URL 구조는 바꾸지 않는다.

## 현재 태그 축

- 언어: `vocab`, `korean`, `typing`
- 숫자: `math`, `arithmetic`, `chance`
- 사고: `logic`, `deduction`, `strategy`, `pattern`
- 인지: `memory`, `focus`, `space`
- 액션: `reflex`, `timing`, `rhythm`, `arcade`
- 콘텐츠: `trivia`, `story`, `daily`, `mix`

## 향후 후보 컬렉션

- `/arcade/`: 짧은 액션, 러너, 회피, 타이밍 게임
- `/board/`: 카드, 보드, 타일, 전략 게임
- `/story/`: 긴 내러티브, 추리, 방탈출형 게임
- `/sandbox/`: 실험작과 프로토타입

컬렉션은 운영 단위이고, 태그는 탐색 단위다.
