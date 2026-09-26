# 디시인사이드 스타일 리디자인 Implementation Plan

> **For agentic workers:** 이 계획은 Claude Code에서 Task 단위로 순서대로 실행한다. 각 Task의 체크박스(`- [ ]`)를 끝낼 때마다 `npm run check && npm test`를 통과시키고 커밋한다. Task를 건너뛰지 않는다.

**Goal:** 고아 커뮤니티의 기능·API·DB는 그대로 두고, 화면만 디시인사이드(PC 갤러리) 느낌과 최대한 같게 바꾼다. 개추·비추 버튼도 디시처럼 원형 이미지 버튼으로 바꾼다.

**Architecture:** 화면은 `public/app.js`의 템플릿 문자열(`shell`, `listPage`, `postRows`, `postPage`, `writePage`/`editPage`, `rightRail`)과 `public/style.css`가 전부다. 이 두 파일의 **마크업·클래스·CSS만** 바꾼다. 개추·비추 이미지는 직접 그린 SVG를 `public/img/`에 두고, `server.mjs`의 정적 파일 허용 목록(29번째 줄 `files`)에 경로만 추가한다.

**Tech Stack:** Node.js 24, vanilla HTML/CSS/JS, 인라인·정적 SVG. 새 npm 패키지 없음.

**Spec:** 2026-09-26 대화 요청 — "고아 커뮤니티를 완전 디시인사이드처럼, 개추 비추 사진도 가져오고, 기능은 현재 그대로 두고 디자인만 바꾸기".

---

## Claude Code에 붙여넣을 시작 프롬프트

```text
docs/superpowers/plans/2026-09-26-dcinside-style-redesign.md 계획을 Task 0부터 순서대로 실행해줘.
- 기능·API·DB 스키마는 바꾸지 말고 public/app.js 마크업과 public/style.css, public/img/ 이미지만 바꿔.
- data-action, id, data-vote-total/data-downvote-total, aria-* 속성은 그대로 유지해.
- Task마다 npm run check && npm test 통과 후 커밋하고, Playwright로 1280px·390px 스크린샷을 찍어서 확인해줘.
- 참고 스크린샷은 docs/design-ref/ 폴더에 있어.
```

> 참고 스크린샷: 디시인사이드 갤러리 **목록 / 글 보기(개추·비추 박스 포함) / 댓글 / 글쓰기** 화면을 직접 캡처해 `docs/design-ref/`에 넣어두면 Claude Code가 훨씬 비슷하게 만든다(클라우드 세션은 dcinside.com에 접속하지 못할 수 있다). 이 폴더는 참고용이므로 `.gitignore`에 추가해 커밋하지 않는다.

---

## Global Constraints (꼭 지킬 것)

1. **디자인만 변경.** `server.mjs`, `db.mjs`, `security.mjs`, `network.mjs`의 로직·API 응답·DB 스키마는 바꾸지 않는다. 유일한 예외는 Task 4의 정적 이미지 허용 목록 추가다.
2. **JS 동작 훅 유지.** 아래 속성은 이름과 의미를 그대로 둔다(이벤트 처리가 여기에 걸려 있다).
   - `data-action`: `share, vote, downvote, edit, delete-post, delete-comment, pin, scroll-comments, refresh, remove-image, logout, user-logout, add-gallery, edit-gallery, delete-gallery, close-dialog`
   - `id`: `global-search, feed-search, post-form, comment-form, comments, image-input, image-preview, file-label, admin-login-form, settings-form, gallery-form, password-form, confirm-form, dialog-error, manager-settings, manager-transfer, color-value, main`
   - `data-vote-total`, `data-downvote-total`, `data-id`, 버튼의 `aria-pressed`·`disabled` 처리
3. **관리자 색상 설정 유지.** 주 색상은 계속 `var(--accent)`를 쓴다(관리 화면의 색상 변경이 그대로 먹어야 함). 기본값 `#3b4b91`은 디시 파랑과 거의 같으므로 유지한다.
4. **외부 리소스 금지.** CSP가 `img-src 'self' data: blob:`이므로 디시 서버 이미지를 핫링크하면 깨진다. 모든 이미지는 `public/img/`에 로컬 파일로 둔다.
5. **디시 자산을 복사하지 않는다.** 디시인사이드 로고·이름·원본 이미지 파일은 디시 소유이므로 내려받아 쓰지 않는다. 개추·비추 버튼과 목록 아이콘은 **모양과 색을 따라 그린 자체 SVG**로 만든다. 사이트 이름은 계속 `boot.settings.name`(고아 커뮤니티)을 쓴다.
6. **접근성 유지.** 버튼 라벨(`aria-label`), `skip` 링크, `aria-live` 카운트, 포커스 표시를 없애지 않는다.
7. **반응형 유지.** 1280px(PC)과 390px(모바일)에서 가로 스크롤 없이 보여야 한다.

---

## 디시 스타일 기준표 (모든 Task에서 참고)

| 요소 | 디시 느낌으로 맞출 값 |
|---|---|
| 기본 글꼴 | `'Malgun Gothic','맑은 고딕',Dotum,'돋움',AppleSDGothicNeo,sans-serif`, 본문 12~13px |
| 주 색상 | `var(--accent)` (기본 `#3b4b91`, 디시 파랑과 동일 계열) |
| 선 색 | 목록 행 구분 `#eee`, 박스 테두리 `#ccc`/`#d6d6d6`, 표 머리 위 2px `var(--accent)` |
| 링크 | 밑줄 없음, hover 시 밑줄. **방문한 글 제목은 보라색**(`a:visited .post-title{color:#770088}` 계열) |
| 댓글 수 | 제목 뒤 `[3]` 굵게, 작은 글씨 |
| 새 글 | 제목 뒤 작은 `N` 아이콘 |
| 비회원 | `닉네임(123.45)` — IP는 회색 작은 글씨 (현재 `ip-display` 그대로 사용) |
| 회원 | 닉네임 뒤 고정닉 스타일 작은 아이콘 (`p.user_id`가 있으면 표시, 디자인 전용) |
| 버튼 | 사각형 2px 라운드, 주요 버튼은 파란 배경 흰 글씨(`글쓰기`, `등록`), 보조 버튼은 흰 배경 회색 테두리 |
| 개추 버튼 | 파란 원형 + 흰 엄지 위 아이콘 + 아래 `개추` 라벨, 왼쪽에 빨간 추천 수 |
| 비추 버튼 | 회색 원형 + 흰 엄지 아래 아이콘 + 아래 `비추` 라벨, 오른쪽에 회색 비추 수 |

---

### Task 0: 준비 — 기준 스크린샷과 작업 환경

**Files:**
- Create: `docs/design-ref/` (로컬 참고용, 커밋 안 함)
- Modify: `.gitignore`

- [ ] `docs/design-ref/`를 `.gitignore`에 추가한다.
- [ ] 서버를 띄우고(`DATA_DIR=<scratch> node server.mjs`) 샘플 글 25개 이상·댓글·사진 글·공지·개념글을 API로 만들어 목록 페이지가 2쪽 이상 되게 한다.
- [ ] Playwright로 **현재 화면**을 1280px·390px에서 찍어 둔다: 목록(`#/`), 개념글(`#/?sort=popular`), 글 보기(`#/post/<id>`), 글쓰기(`#/write`), 로그인(`#/login`), 관리(`#/admin`). 이후 모든 Task에서 같은 경로로 다시 찍어 비교한다.
- [ ] `npm run check && npm test`가 통과하는 것을 확인한다(기준선).

### Task 1: 디자인 토큰과 기본 스타일 정리

**Files:**
- Modify: `public/style.css`

- [ ] `style.css`를 섹션별(토큰 / 기본 / 헤더 / 목록 / 글 보기 / 댓글 / 글쓰기 / 레일 / 푸터 / 관리 / 다이얼로그 / 반응형)로 줄바꿈 정리해 읽기 쉽게 만든다. 동작하는 선택자는 지우지 말고 옮기기만 한다.
- [ ] `:root`에 토큰 추가: `--line:#eee`, `--box:#ccc`, `--muted:#777`, `--visited:#770088`, `--recommend:#d31900`(개추 수 빨강), `--gray-btn:#9a9a9a`.
- [ ] 기준표의 글꼴·크기·링크 규칙을 적용한다.
- [ ] 1280/390 스크린샷으로 깨진 곳이 없는지 확인 → 커밋 `style: reorganize stylesheet and add DC-style tokens`.

### Task 2: 상단 헤더·메뉴 바 (`shell()`)

**Files:**
- Modify: `public/app.js` (`brand`, `accountLinks`, `shell`)
- Modify: `public/style.css`

- [ ] 맨 위 얇은 유틸 줄: 오른쪽에 `로그인 | 회원가입` 또는 `닉네임님 | 로그아웃`, `매니저 관리`, `관리자` 링크(현재 링크 그대로, 모양만 디시처럼 작은 회색 글씨).
- [ ] 로고 줄: 왼쪽 사이트 이름(굵은 파란 글자, 로고 이미지 아님), 가운데 파란 3px 테두리 검색창 + 파란 돋보기 버튼(현재 `#global-search` 유지).
- [ ] 파란 메뉴 바(GNB): `갤러리 · 개념글 · 공지사항 · 글쓰기 · 관리` — 선택된 메뉴는 노란 글씨(현재처럼), 높이·글자 크기를 디시 GNB에 맞춘다. 오른쪽 통계 문구 유지.
- [ ] `recent-bar`(갤러리 바로가기)는 디시의 "최근 방문 갤러리" 줄처럼 회색 배경 한 줄로.
- [ ] 스크린샷 비교 → 커밋 `style: DC-style header and navigation`.

### Task 3: 갤러리 목록 화면 (`listPage`, `postRows`)

**Files:**
- Modify: `public/app.js` (`listPage`, `postRows`, `postBadges`, `authorLabel` 표시부)
- Modify: `public/style.css`
- Create: `public/img/icon-text.svg`, `public/img/icon-image.svg`, `public/img/icon-best.svg`, `public/img/icon-notice.svg`, `public/img/icon-member.svg` (Task 4에서 서버 허용 목록에 함께 추가)

- [ ] 갤러리 제목 영역: `○○ 갤러리` 큰 파란 제목 + 오른쪽 작은 링크(`갤주소 복사`, `이용안내`), 아래 2px 파란 선.
- [ ] 탭: 왼쪽에 `전체글 / 개념글 / 공지` 사각 탭(선택 시 파란 배경), 오른쪽에 파란 `글쓰기` 버튼.
- [ ] 목록 표 열 순서를 디시처럼 **번호 · 말머리 · 제목 · 글쓴이 · 작성일 · 조회 · 추천**으로 바꾼다. 말머리는 현재 제목 안의 `[카테고리]`를 별도 `<td class="category">`로 분리한다(데이터는 같은 `p.category`).
- [ ] 제목 앞 아이콘을 디시처럼: 일반 글(텍스트 아이콘), 사진 글(`p.image`), 개념글(`p.votes >= popularThreshold`), 공지(`p.pinned`, 행 전체 굵게·연한 배경). 아이콘은 `<img src="/img/icon-*.svg" alt="">` 또는 CSS 배경으로.
- [ ] 제목 뒤 `[댓글수]` 굵게, 24시간 이내 `N` 표시(기존 로직 유지), 방문한 글은 보라색.
- [ ] 글쓴이: 비회원은 `닉네임(IP)`, 회원(`p.user_id`)은 닉네임 뒤 `icon-member.svg`. 작성일은 오늘이면 `HH:MM`, 아니면 `MM.DD`(기존 `date()` 확인 후 필요 시 표시 형식만 조정).
- [ ] 하단: 왼쪽 `전체글/개념글` 작은 버튼, 오른쪽 `글쓰기` 파란 버튼 → 가운데 페이지 번호(현재 페이지 빨간 굵은 글씨, `이전/다음` 링크) → 검색줄(`제목+내용` 셀렉트 모양 + 입력 + `검색` 버튼, 현재 `#feed-search` 유지).
- [ ] 390px에서는 표 대신 2줄 카드형(제목 / 글쓴이·시간·조회·추천) — 현재 `.mobile-meta` 활용.
- [ ] 스크린샷 비교 → 커밋 `style: DC-style gallery list`.

### Task 4: 개추·비추 이미지 버튼 (핵심)

**Files:**
- Create: `public/img/recommend-up.svg`, `public/img/recommend-down.svg`
- Modify: `server.mjs` (29번째 줄 정적 파일 허용 목록만)
- Modify: `public/app.js` (`postPage`의 `.reaction-box` 마크업)
- Modify: `public/style.css` (`.reaction-*`)
- Create: `test/static-assets.test.mjs`

- [ ] **이미지 제작(직접 그림):**
  - `recommend-up.svg`: 64×64, 파란 원(`#3b4b91`) 안에 흰 엄지 위 아이콘.
  - `recommend-down.svg`: 64×64, 회색 원(`#9a9a9a`) 안에 흰 엄지 아래 아이콘.
  - 디시 원본 파일을 내려받거나 트레이싱하지 말고, 단순한 엄지 도형 path로 새로 그린다. 파일은 1KB 안팎.
- [ ] **서버 허용 목록 추가:** `files` 객체에 `'/img/recommend-up.svg'`, `'/img/recommend-down.svg'`, Task 3의 `'/img/icon-*.svg'`를 `'img/…'` 경로로 추가한다. 기존 `mime` 판별(`.svg` → `image/svg+xml`)을 그대로 쓴다. 정규식 등 새로운 경로 패턴은 만들지 않는다(경로 탐색 방지).
- [ ] **실패하는 테스트 먼저:** `test/static-assets.test.mjs`에서 서버를 띄워 각 `/img/*.svg`가 `200`과 `image/svg+xml`을 돌려주고, `/img/../server.mjs`나 없는 파일은 `404`인지 확인한다. (기존 테스트의 서버 기동 방식을 따라 한다.) 구현 전 실패 확인 → 구현 후 통과.
- [ ] **개추 박스 마크업(디시 배치):**
  ```
  ┌──────────────────────────────────────┐
  │   12   (●개추)   (●비추)   3          │  ← 빨간 추천 수 / 파란 원 / 회색 원 / 회색 비추 수
  ├──────────────────────────────────────┤
  │   공유           |          신고/새로고침 │  ← 기존 reaction-tools 버튼 유지
  └──────────────────────────────────────┘
  ```
  - 버튼 내용은 `<img src="/img/recommend-up.svg" alt=""><span>개추</span>`, `<img src="/img/recommend-down.svg" alt=""><span>비추</span>`. `aria-label`은 `개념 추천`/`비추` 유지.
  - `data-action="vote"|"downvote"`, `data-id`, `aria-pressed`, `disabled`, `data-vote-total`, `data-downvote-total`은 그대로.
  - 이미 누른 버튼(`.voted`)은 살짝 흐리게 + 테두리 링, hover 시 살짝 어둡게.
- [ ] 목록의 `추천` 열과 글 상단 `추천 n | 비추 n` 표기는 그대로 두되 라벨은 디시처럼 `추천`/`비추` 유지.
- [ ] `npm run check && npm test` → 브라우저에서 개추·비추를 실제 눌러 숫자 증가·재클릭 불가 확인 → 커밋 `feat: DC-style recommend/unrecommend image buttons`.

### Task 5: 글 보기 화면 (`postPage`)

**Files:**
- Modify: `public/app.js` (`postPage`)
- Modify: `public/style.css`

- [ ] 상단: 갤러리 이름 바(파란 2px 선) → 제목 줄 `[말머리] 제목` (굵게 15~16px).
- [ ] 정보 줄: 왼쪽 `글쓴이(IP) | 2026.09.26 12:34:56`, 오른쪽 `조회 n | 추천 n | 댓글 n` — 아래 회색 1px 선. 날짜 형식은 `postTime` 출력만 조정.
- [ ] 본문: 좌우 여백, 줄간격 1.8, 이미지는 본문 폭에 맞춤.
- [ ] Task 4의 개추·비추 박스를 본문 아래 가운데.
- [ ] 하단 버튼 줄: 왼쪽 `전체글 / 개념글`, 오른쪽 `수정 / 삭제 / 공지`(권한 표시 조건은 현재 로직 그대로) + 파란 `글쓰기`.
- [ ] 글 아래에 **같은 갤러리 목록**을 Task 3 표 스타일로 다시 보여준다(`postPage`가 이미 `list`를 불러오므로 API 추가 없음). 현재 보고 있는 글 행은 굵게 표시.
- [ ] 스크린샷 비교 → 커밋 `style: DC-style post view`.

### Task 6: 댓글 영역

**Files:**
- Modify: `public/app.js` (`postPage` 댓글 부분)
- Modify: `public/style.css`

- [ ] 머리: `전체 댓글 N개` (N 빨강) + 오른쪽 `새로고침`(기존 `refresh` 액션).
- [ ] 각 댓글 한 줄: 왼쪽 고정폭 글쓴이(`닉네임(IP)`/회원 아이콘) · 가운데 내용 · 오른쪽 `MM.DD HH:MM` + 삭제 `X`(기존 `delete-comment`). 행 구분 `#eee` 선.
- [ ] 입력 폼(`#comment-form`): 왼쪽 세로로 닉네임·비밀번호(비회원일 때만, 현재 조건 유지), 오른쪽 넓은 textarea, 아래 오른쪽 파란 `등록` 버튼. 회색 배경 박스.
- [ ] 390px에서 글쓴이/시간 한 줄, 내용 다음 줄.
- [ ] 커밋 `style: DC-style comments`.

### Task 7: 글쓰기·수정 화면 (`writePage`, `editPage`)

**Files:**
- Modify: `public/app.js`
- Modify: `public/style.css`

- [ ] 상단 `○○ 갤러리 글쓰기` + 2px 파란 선.
- [ ] 비회원 닉네임·비밀번호 입력은 제목 위 한 줄에 나란히(디시 글쓰기 배치).
- [ ] 말머리 선택 + 제목 입력 한 줄, 그 아래 넓은 본문 영역(회색 테두리 박스), 사진 첨부 줄, 19 체크, 공지 체크(운영자만) — 필드 이름·검증은 그대로.
- [ ] 하단 오른쪽 `취소`(흰 버튼) · `등록`(파란 버튼).
- [ ] 커밋 `style: DC-style editor`.

### Task 8: 오른쪽 레일·푸터

**Files:**
- Modify: `public/app.js` (`rightRail`, `shell` 푸터)
- Modify: `public/style.css`

- [ ] 레일 로그인 박스: 로그인 안 했으면 `로그인` 파란 버튼 + `회원가입` 링크, 했으면 `닉네임님` + `로그아웃`(기존 `user-logout`) — 디시 우측 로그인 박스 모양.
- [ ] `실시간 개념글`(추천 순, 현재 `posts`로 계산 가능) · `최근 게시글` · `우리 갤러리` 목록을 번호 붙은 작은 리스트로. 새 API는 만들지 않는다.
- [ ] 푸터: 가운데 작은 회색 링크 줄 + 사이트 이름 저작 표기(디시 문구 복사 금지).
- [ ] 커밋 `style: DC-style right rail and footer`.

### Task 9: 로그인·회원가입·관리·DB 화면 톤 맞추기

**Files:**
- Modify: `public/style.css` (필요할 때만 `public/app.js`)

- [ ] 로그인·회원가입: 가운데 좁은 박스, 파란 제목, 입력칸 세로, 파란 `로그인` 버튼(디시 로그인 페이지 느낌).
- [ ] 관리/매니저/DB 화면은 구조는 두고 버튼·표·탭 색만 새 토큰으로 통일.
- [ ] 다이얼로그(`#dialog`)와 토스트 색을 새 톤으로.
- [ ] 커밋 `style: align auth and admin screens`.

### Task 10: 모바일 마무리와 최종 검증

**Files:**
- Modify: `public/style.css`
- Modify: `README.md`, `사용안내.md`

- [ ] 390px: 헤더는 로고+검색 아이콘 한 줄, 메뉴 바는 가로 스크롤 없이 줄바꿈 또는 축약, 목록은 카드형, 개추 박스는 폭 100%.
- [ ] Task 0과 같은 경로·폭으로 **변경 후 스크린샷**을 찍고, 이전/이후와 `docs/design-ref/` 디시 캡처를 나란히 비교해 차이 나는 부분을 고친다.
- [ ] 기능 회귀 수동 점검: 비회원 글쓰기/수정/삭제, 회원 로그인 글쓰기, 사진 첨부, 개추·비추(한 번만), 댓글 작성·삭제, 검색, 페이지 이동, 개념글 탭, 관리자 색상 변경이 새 디자인에 반영되는지.
- [ ] `README.md`·`사용안내.md`의 "파란 별 **개념** 버튼 / 회색 화살표 **비추** 버튼" 문구를 "파란 원형 **개추** 버튼 / 회색 원형 **비추** 버튼"으로 바꾼다.
- [ ] `npm run check && npm test` 최종 통과 → 커밋 `docs: update guide for DC-style design` → 푸시.

---

## 완료 기준

- 모든 테스트(`npm test`)와 문법 검사(`npm run check`) 통과, GitHub Actions(Linux·Windows) 초록.
- 1280px·390px에서 목록·글 보기·글쓰기가 디시 갤러리와 나란히 봤을 때 배치·색·크기가 비슷하다.
- 개추·비추가 원형 이미지 버튼으로 보이고, 누르면 기존과 똑같이 DB에 저장된다.
- API·DB 스키마·권한 로직 변경 없음(`git diff master -- server.mjs`는 정적 이미지 허용 목록 줄만 바뀜).
- 디시인사이드 로고·이름·원본 이미지 파일을 쓰지 않았다.
