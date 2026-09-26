# 디시인사이드 스타일 디자인 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고아 커뮤니티의 기능·데이터·API는 그대로 두고, 화면만 디시인사이드 갤러리와 거의 같은 느낌(색·밀도·표·버튼·개추/비추 박스·댓글 박스)으로 바꾼다.

**Architecture:** 변경 범위는 `public/style.css`와 `public/app.js`의 HTML 템플릿 문자열로 제한한다. 개추·비추 버튼과 작은 목록 아이콘은 직접 그린 SVG 파일로 `public/img/`에 두고, `server.mjs`의 정적 파일 허용 목록에 `/img/*.svg` 한 가지 경로만 추가한다. DB 스키마, `/api/*` 요청·응답 형식, 권한 로직은 바꾸지 않는다.

**Tech Stack:** Node.js 24 native HTTP server, vanilla HTML/CSS/JavaScript, 인라인 가능한 수제 SVG. npm 패키지 추가 없음.

**Spec:** 2026-09-26 대화 요청 — "고아 커뮤니티를 완전 디시인사이드처럼, 개추·비추 사진도 가져오고, 현재 기능은 그대로 두고 디자인만 바꾸기".

## 바로 실행용 프롬프트

Claude Code에서 아래 한 줄로 시작한다.

```text
docs/superpowers/plans/2026-09-26-dcinside-style-redesign.md 계획을 Task 0부터 순서대로 실행해줘. 각 Task가 끝날 때마다 npm run check && npm test 통과를 확인하고 커밋해.
```

## Global Constraints

- **디자인만 바꾼다.** `db.mjs`, `security.mjs`, `network.mjs`, `/api/*` 응답 형식은 수정하지 않는다. `server.mjs`는 Task 1의 정적 이미지 경로 추가만 허용한다.
- 기존 기능이 모두 그대로 동작해야 한다: 회원·비회원 글쓰기, 글 비밀번호, 수정·삭제, 공지, 19 표시, 개념글, 개념·비추 1회 제한, 매니저 관리, 관리자·DB 화면, 비회원 IP 표시, 검색, 말머리, 페이지 이동.
- **디시인사이드 이미지 파일·로고·상표를 복사하거나 핫링크하지 않는다.** 개추·비추 버튼과 아이콘은 비슷한 모양으로 직접 SVG를 그린다. 이유:
  1. 디시 이미지와 로고는 디시인사이드의 저작물·상표다.
  2. `server.mjs`의 CSP가 `img-src 'self' data: blob:`이라 외부 이미지 주소는 어차피 브라우저가 차단한다.
  3. 디시 CDN은 외부 사이트에서 이미지를 불러가는 핫링크를 막는다.
- 사이트 이름은 계속 `boot.settings.name`(고아 커뮤니티)을 사용한다. "dcinside" 문구, 디시 로고, 디시 도메인은 넣지 않는다.
- 관리자 설정의 `accent` 색상 변경 기능은 유지한다. 디시 파랑은 기본값처럼 쓰되 `--accent` 변수를 통해 바뀔 수 있어야 한다.
- 추가 npm 패키지, 외부 폰트, 외부 CDN을 사용하지 않는다. CSP를 완화하지 않는다.
- 모바일(360px)에서 가로 스크롤이 생기지 않아야 한다.
- 모든 Task 종료 시 `npm run check`와 `npm test`가 통과해야 한다.

## 디자인 토큰 (디시 느낌 기준값)

`public/style.css`의 `:root`에 아래 값을 정의하고 이후 모든 Task에서 재사용한다. 값은 참고 스크린샷을 보고 미세 조정할 수 있다.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--accent` | `#3b4890` | 갤러리 제목 바, 검색창 테두리, 주요 버튼, 현재 페이지 번호 |
| `--accent-dark` | `#29367c` | 버튼 hover, 제목 바 하단선 |
| `--accent-tint` | `#eef0f9` | 선택된 탭, 공지 행 배경 |
| `--line` | `#e5e5e5` | 표 행 구분선 |
| `--line-strong` | `#cecece` | 박스 테두리 |
| `--text` | `#333` | 본문 |
| `--muted` | `#999` | 날짜·조회·IP |
| `--red` | `#d31900` | 댓글 수 `[3]`, 추천 수, N 표시 |
| `--notice-bg` | `#f9f9f9` | 공지 행 |
| 기본 글꼴 | `'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Dotum,'돋움',sans-serif` | |
| 기본 크기 | 목록 13px, 보조 12px, 행 높이 약 25px | |

---

### Task 0: 기준 스크린샷과 참고 자료 준비

**Files:**
- Create: `docs/design/README.md` (참고 방법만 기록, 디시 스크린샷 파일은 커밋하지 않음)
- Modify: `.gitignore` — `docs/design/reference/`, `runtime/screens/` 추가

**Interfaces:** 없음 (작업용 준비).

- [ ] 사용자가 원하는 디시 화면(갤러리 목록, 글 보기, 개추 박스, 댓글, 글쓰기, 모바일)을 직접 캡처해 `docs/design/reference/`에 넣도록 안내한다. 이 폴더는 `.gitignore`로 저장소에 올리지 않는다(디시 저작물).
- [ ] `node server.mjs`를 임시 `DATA_DIR`(스크래치 폴더)로 띄우고, 샘플 글·댓글·공지·이미지 글·19 글·개념글을 API로 만든다.
- [ ] 사전 설치된 Playwright(Chromium, `PLAYWRIGHT_BROWSERS_PATH` 설정됨)로 현재 화면을 1280px·360px 폭에서 캡처해 `runtime/screens/before-*.png`에 저장한다. `package.json`에 Playwright를 추가하지 않고 스크래치 스크립트로만 실행한다.
- [ ] 캡처 대상 경로: `#/`, `#/gallery/1`, `#/?sort=popular`, `#/post/<id>`, `#/write`, `#/login`, `#/admin`.

### Task 1: 정적 이미지 경로 `/img/*.svg` 추가

**Files:**
- Modify: `server.mjs` (정적 파일 분기 30~35행 부근)
- Create: `test/static-assets.test.mjs`
- Create: `public/img/.gitkeep` (Task 2에서 실제 파일로 대체)

**Interfaces:**
- `GET /img/<name>.svg` — `name`은 `^[a-z0-9-]{1,40}$`만 허용, `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=86400`.
- 그 외 경로(`/img/../server.mjs`, `/img/a.png`, `/img/A.svg`)는 기존과 같이 404.

- [ ] 실패하는 테스트를 먼저 작성한다: 존재하는 SVG는 200 + 올바른 MIME, 경로 조작·대문자·다른 확장자는 404, 응답에 기존 CSP 헤더가 그대로 붙는지 확인.
- [ ] `node --test test/static-assets.test.mjs`로 실패를 확인한다.
- [ ] 기존 `/uploads/` 정규식 분기 옆에 `/^\/img\/[a-z0-9-]{1,40}\.svg$/` 분기를 추가하고 `join(root,'public','img',...)`로 읽는다.
- [ ] CSP 문자열은 수정하지 않는다(`'self'` 이미지이므로 허용됨).
- [ ] CI 패키징 단계(`tar ... public`)가 `public/img`를 자동 포함하는지 확인한다.
- [ ] `npm run check && npm test` 통과 후 커밋.

### Task 2: 개추·비추 버튼과 목록 아이콘 SVG 제작

**Files:**
- Create: `public/img/recommend-up.svg` — 파란 원(`#3b4890`) 안에 흰색 엄지 위 모양 + 하단 "개추" 글자
- Create: `public/img/recommend-down.svg` — 회색 원(`#8a8a8a`) 안에 흰색 엄지 아래 모양 + 하단 "비추" 글자
- Create: `public/img/icon-image.svg` — 목록 제목 앞 "사진 첨부" 작은 아이콘(13×13)
- Create: `public/img/icon-text.svg` — 일반 글 아이콘
- Create: `public/img/icon-notice.svg` — 공지 확성기/느낌표 아이콘
- Create: `public/img/icon-concept.svg` — 개념글 아이콘(빨간 계열)
- Create: `public/img/icon-member.svg` — 회원(고정닉 느낌) 아이콘
- Create: `public/img/icon-manager.svg` — 매니저 아이콘

**Interfaces:** Task 1 경로로 제공. 각 파일은 `viewBox`가 있고 `width/height` 고정값이 없어 CSS로 크기를 조절할 수 있어야 한다.

- [ ] 참고 스크린샷을 보고 모양·비율을 맞추되 경로(path)는 새로 그린다. 디시 원본 이미지를 다운로드·추적·변환하지 않는다.
- [ ] 글자는 SVG `<text>` 대신 path로 넣거나 CSS 라벨로 분리해 폰트 차이로 깨지지 않게 한다(추천: 원형 아이콘만 SVG, "개추/비추" 글자는 버튼 안 `<span>`).
- [ ] 각 SVG에 스크립트·외부 참조·`<foreignObject>`가 없는지 확인한다.
- [ ] 흰 배경·회색 배경에서 모두 또렷한지 32px·58px 크기로 확인한다.
- [ ] 사용자가 권리를 가진 다른 이미지로 바꾸고 싶다면 같은 파일 이름으로 교체하면 되도록 `docs/design/README.md`에 적는다.
- [ ] 커밋.

### Task 3: 전역 스타일 초기화와 디자인 토큰

**Files:**
- Modify: `public/style.css` (`:root`, 기본 요소, `.button` 계열)

**Interfaces:** 위 "디자인 토큰" 표의 CSS 변수.

- [ ] `:root`의 글꼴·크기·색 변수를 디시 기준으로 교체한다. `shell()`이 `--accent`를 덮어쓰는 동작은 유지한다.
- [ ] 버튼을 디시식으로 통일한다: 높이 28~30px, 모서리 2px 이하, 기본 버튼은 흰 배경 + `#cecece` 테두리, `.primary`는 `--accent` 배경 + `--accent-dark` 테두리 + 흰 글자 굵게.
- [ ] 입력창은 1px `#cecece` 테두리, 포커스 시 `--accent` 테두리(그림자 없이).
- [ ] `index.html`의 `theme-color`를 `#3b4890`으로 맞춘다.
- [ ] 변수 이름을 바꾼 경우 `style.css` 전체에서 옛 이름 참조가 남지 않았는지 `grep`으로 확인한다.
- [ ] 커밋.

### Task 4: 상단 헤더·검색·갤러리 제목 바

**Files:**
- Modify: `public/app.js` — `brand()`, `accountLinks()`, `shell()`, `listPage()`의 `gallery-heading`/`gallery-intro`
- Modify: `public/style.css` — `.header`, `.utility`, `.global-search`, `.top-nav`, `.recent-bar`, `.gallery-heading`, `.gallery-intro`

**Interfaces:** 링크 대상(`#/`, `#/?sort=popular`, `#/admin`, `#/login`, `#/manager` 등)과 `#global-search` 폼 id, `data-action="share"`는 그대로 유지한다.

- [ ] 최상단 유틸리티 줄: 오른쪽 정렬의 작은 회색 텍스트 링크(로그인 | 회원가입 | 매니저 관리 | 관리자)로 정리한다.
- [ ] 로고 줄: 왼쪽에 사이트 이름 워드마크(굵은 `--accent` 글자 + "갤러리" 작은 글자), 가운데에 파란 두꺼운 테두리(2px `--accent`) 검색창과 파란 돋보기 버튼.
- [ ] GNB: `--accent` 배경의 가로 메뉴(갤러리 / 개념글 / 공지사항 / 글쓰기 / 관리), 선택 항목은 밑줄 또는 진한 배경.
- [ ] 갤러리 제목 바: 목록 상단에 "갤러리명 갤러리" 큰 제목(`--accent` 굵게) + 오른쪽에 `설정 | 갤주소 복사 | 이용안내` 작은 링크, 아래 2px `--accent` 선.
- [ ] 기존 `gallery-intro` 소개 영역은 디시의 갤러리 소개 박스처럼 얇은 테두리 + 작은 글씨로 압축한다(매니저·게시글 수 정보는 유지).
- [ ] `최근 방문 갤러리` 줄(`recent-bar`)은 회색 배경의 한 줄 가로 스크롤로 유지한다.
- [ ] 커밋.

### Task 5: 게시글 목록 표·탭·말머리·페이지·하단 검색

**Files:**
- Modify: `public/app.js` — `postBadges`, `postRows()`, `listPage()`의 `feed-toolbar`, `post-table` 헤더, `list-bottom`, `pagination`
- Modify: `public/style.css` — `.feed-toolbar`, `.tabs`, `.category-chips`, `.post-table`, `.pagination`, `.list-bottom`, `.popular-banner`

**Interfaces:** `listUrl()`로 만드는 쿼리(`sort`, `page`, `q`, `category`)와 `data-action="refresh"`는 그대로 사용한다.

- [ ] 탭: `전체글 | 개념글 | 공지` 를 디시처럼 사각 탭으로, 선택 탭은 `--accent` 글자 + 흰 배경 + 아래선 제거. 오른쪽에 `글쓰기` primary 버튼.
- [ ] 말머리 버튼 줄: 이미 있는 `.category-chips`(`listPage()` 35행 부근, `category` 파라미터 연결됨)를 디시식 작은 사각 버튼 줄로 다시 꾸민다. 선택된 말머리는 `--accent` 테두리·글자. 링크 동작은 바꾸지 않는다.
- [ ] 표 헤더 순서: `번호 | 말머리 | 제목 | 글쓴이 | 작성일 | 조회 | 추천`. 헤더는 위아래 2px/1px `--accent` 선, 가운데 정렬, 굵게.
- [ ] 행: 높이 약 25px, 1px `--line` 구분선, hover 시 `#f5f5f5`.
- [ ] 제목 셀: 아이콘(`icon-notice`/`icon-image`/`icon-text`/`icon-concept` 이미지) → 19 배지 → 제목 → 빨간 `[댓글수]` → N 표시 순서. 기존 `row-icon` 글자 아이콘(`!`, `▧`, `●`)은 `<img src="/img/..." alt="" width="13" height="13">`로 교체.
- [ ] 공지 행: 번호 자리에 굵은 "공지", 행 배경 `--notice-bg`, 제목 굵게.
- [ ] 글쓴이 셀: 닉네임 + 회색 `(123.45)` IP(`authorLabel` 유지). 회원 글(`p.user_id` 존재)은 닉네임 뒤에 `icon-member`, 해당 갤러리 매니저(`gallery.manager_id===p.user_id`)는 `icon-manager`. 운영자 역할은 API가 주지 않으므로 표시하지 않는다(API 변경 금지).
- [ ] 작성일: 오늘 글은 `HH:MM`, 이전 글은 `MM.DD` (기존 `date()` 보조 함수 옆에 `listDate()` 추가).
- [ ] 페이지 번호: 가운데 정렬, 현재 페이지는 `--accent` 굵은 글자 + 밑줄 없음, 나머지는 회색. 이전/다음은 `‹ ›` 대신 `이전` `다음` 작은 버튼.
- [ ] 하단 검색: 페이지 번호 아래에 `[제목+내용] [검색어] [검색]` 줄을 추가하고 기존 `q` 파라미터로 연결한다. 서버 검색은 제목+내용만 지원하므로 `제목+내용`은 고정 라벨로 표시하고 글쓴이·댓글 검색 select는 만들지 않는다(API 변경 금지).
- [ ] 개념글 탭 상단 `popular-banner`를 디시식 얇은 안내 줄로 축소.
- [ ] 커밋.

### Task 6: 글 보기 화면과 개추·비추 박스

**Files:**
- Modify: `public/app.js` — `postPage()`의 제목 영역·본문·`reaction-box`, 그리고 투표 후 DOM을 갱신하는 코드(약 115~125행)
- Modify: `public/style.css` — `.post-detail`, `.post-title-area`, `.post-meta-line`, `.post-body`, `.reaction-*`, `.post-action-strip`

**Interfaces:** `data-action="vote"`, `data-action="downvote"`, `data-vote-total`, `data-downvote-total`, `data-action="share"`, `data-action="scroll-comments"`, `aria-pressed`, `disabled` 처리는 그대로 유지해야 투표 로직이 동작한다.

- [ ] 제목 영역: 위 2px `--accent` 선, `[말머리] 제목` 한 줄(굵게 15px), 아래 줄 왼쪽 `닉네임(IP) | 2026.09.26 12:34:56`, 오른쪽 `조회 12 | 추천 3 | 댓글 4` 회색.
- [ ] 본문: 좌우 여백 넉넉히, 14px, 줄간격 1.8. 첨부 이미지는 최대 폭 100%로 본문 안에 표시.
- [ ] 개추 박스 레이아웃(가로 가운데, 테두리 박스):
  - 왼쪽 빨간 큰 숫자(`--red`, 약 22px) = 추천 수
  - 파란 원형 `recommend-up.svg` 버튼(약 58px) + 아래 "개추"
  - 회색 원형 `recommend-down.svg` 버튼 + 아래 "비추"
  - 오른쪽 회색 큰 숫자 = 비추 수
  - 박스 하단 줄: `공유 | 댓글 N` (기존 `reaction-tools` 유지)
- [ ] 기존 인라인 `<svg>` 별·화살표를 `<img src="/img/recommend-up.svg" alt="">`로 교체하고 버튼 `aria-label`은 "개념 추천"/"비추"로 유지한다.
- [ ] 누른 후 상태: 버튼 투명도 살짝 낮추고 `disabled`, 누르는 순간 짧은 눌림 애니메이션(`transform: scale(.92)` 120ms). `prefers-reduced-motion`이면 애니메이션 끔.
- [ ] 목록 제목의 "개념" 배지가 투표 후 즉시 붙는 기존 코드가 새 마크업에서도 동작하는지 확인한다(`.post-title-area h2` 선택자가 바뀌면 함께 수정).
- [ ] 관리 버튼 줄(`post-manage`): 오른쪽 정렬 작은 회색 버튼(`수정 | 삭제 | 공지 지정`).
- [ ] 글 아래 `전체글 | 개념글 | 글쓰기` 버튼 줄과 하단 목록 표는 Task 5 스타일을 재사용한다.
- [ ] README의 "파란 별 개념 / 회색 화살표 비추" 설명을 새 버튼 모양으로 고친다.
- [ ] 커밋.

### Task 7: 댓글 박스

**Files:**
- Modify: `public/app.js` — `postPage()`의 `.comments`, `.comments-heading`, `.comment`, `.comment-form`
- Modify: `public/style.css` — `.comments*`, `.comment*`, `.no-comments`

**Interfaces:** 댓글 폼 필드 `name` 속성, 삭제 버튼 `data-action`, Shift+Enter 동작은 그대로 유지한다.

- [ ] 헤더 줄: `전체 댓글 N개` (N은 `--red`) + 오른쪽 `본문 보기 | 댓글 닫기 | 새로고침` 작은 링크(동작이 없는 링크는 넣지 않는다).
- [ ] 댓글 목록: 위 2px `--accent` 선, 각 댓글 한 줄 레이아웃 `닉네임(IP) | 내용 | 날짜 × `, 1px `--line` 구분선, 닉네임 칸 고정폭(약 130px), 날짜 회색 오른쪽.
- [ ] 작성 폼: 왼쪽 세로로 `닉네임` `비밀번호` 입력(비회원일 때만, 회원은 닉네임 고정 표시), 오른쪽 넓은 textarea, 아래 오른쪽 `등록` primary 버튼. 회색 배경(`#f3f3f3`) 박스.
- [ ] (선택) 디시의 "등록+추천" 버튼: 댓글 등록 성공 후 기존 추천 API를 한 번 더 호출하는 순수 UI 조합으로만 구현한다. 이미 추천했으면 숨긴다. 사용자 확인 후 진행.
- [ ] 커밋.

### Task 8: 오른쪽 사이드바(rightRail)

**Files:**
- Modify: `public/app.js` — `rightRail()`
- Modify: `public/style.css` — `.right-rail`, `.rail-*`

- [ ] 로그인 박스: 디시처럼 테두리 박스 안에 로그인 상태/`로그인` `회원가입` 버튼(비로그인), `닉네임님 | 로그아웃 | 내 정보`(로그인).
- [ ] "갤러리 현황", "최근 게시글", "우리 갤러리", "이용안내" 섹션 제목을 `--accent` 굵은 글자 + 아래 2px 선으로 통일하고 목록은 12px 줄 목록으로.
- [ ] 최근 게시글 목록의 댓글 수 `[N]`은 `--red`.
- [ ] 1024px 미만에서는 사이드바를 목록 아래로 내린다(기존 반응형 동작 유지).
- [ ] 커밋.

### Task 9: 글쓰기·로그인·회원가입·관리 화면 톤 맞추기

**Files:**
- Modify: `public/app.js` — `writePage()`, `authPage()`, `accountPage()`, `adminPage()`, `usersPage()`, `managerPage()`, `databasePage()` 의 래퍼 마크업(필요한 경우만)
- Modify: `public/style.css` — `.write-*`, `.auth-*`, `.admin-*`, `.user-*`

- [ ] 글쓰기: 상단 `갤러리명 갤러리 · 글쓰기` 제목 바, 한 줄씩 `말머리 선택 | 제목`, 비회원은 `닉네임 | 비밀번호`를 제목 위 한 줄에, 본문 textarea, 사진 첨부 줄, 하단 오른쪽 `취소` `등록` 버튼.
- [ ] 로그인·회원가입: 가운데 좁은 박스(약 360px), 파란 제목 바, 입력창 세로 나열, 전체 폭 primary 버튼.
- [ ] 관리·DB·회원 관리: 기능·필드는 그대로, 표와 버튼만 Task 3·5 스타일 재사용.
- [ ] 모든 폼의 `name`, `required`, `maxlength`, `data-action` 값이 바뀌지 않았는지 diff로 확인한다.
- [ ] 커밋.

### Task 10: 모바일 화면

**Files:**
- Modify: `public/style.css` — `@media (max-width: 768px)` / `(max-width: 480px)` 블록

- [ ] 헤더: 로고 + 돋보기 아이콘 한 줄, GNB는 가로 스크롤.
- [ ] 목록: 기존 `mobile-meta`를 활용해 디시 모바일처럼 2줄 카드형(1줄 제목 + `[N]`, 2줄 `닉네임 · 시간 · 조회 · 추천` 회색). 번호·표 헤더 숨김.
- [ ] 개추 박스: 버튼 크기 48px, 숫자와 버튼 간격 축소.
- [ ] 댓글 폼: 닉네임·비밀번호 가로 2칸 + textarea 아래 전체 폭.
- [ ] 360px 폭에서 가로 스크롤이 없는지 `document.documentElement.scrollWidth <= innerWidth`로 확인.
- [ ] 커밋.

### Task 11: 통합 검증과 문서

**Files:**
- Modify: `README.md`, `사용안내.md` (버튼 모양·화면 설명 부분만)
- Update: `docs/design/README.md`

- [ ] `npm run check`, `npm test` 전체 통과.
- [ ] Task 0과 같은 데이터·경로로 `runtime/screens/after-*.png`를 1280px·360px에서 다시 캡처해 before/after와 참고 스크린샷을 나란히 비교한다.
- [ ] 브라우저 콘솔 에러·CSP 위반 경고가 없는지 확인한다(Playwright `page.on('console')`).
- [ ] 수동 기능 확인: 비회원 글쓰기→수정(비밀번호)→삭제, 회원 글쓰기, 사진 첨부 글, 19 글, 개추 1회 후 비활성·새로고침 후 유지, 비추 1회, 개념글 기준 도달 시 배지, 공지 지정·해제, 매니저 화면, 관리자 설정에서 `accent` 색 변경 시 제목 바·버튼 색 반영, 검색·페이지 이동.
- [ ] 키보드만으로 개추·비추·댓글 등록이 가능한지, 포커스 테두리가 보이는지 확인.
- [ ] README의 개념·비추 설명과 화면 설명을 새 디자인에 맞게 고친다.
- [ ] 최종 커밋 후 지정된 브랜치로 push.

## 범위 밖 (이번 계획에서 하지 않음)

- 새 API·DB 컬럼(예: 운영자 아이콘용 역할 노출, 실시간 베스트, 신고, 짤방·디시콘) — 필요하면 별도 계획으로 진행한다.
- 디시인사이드 원본 이미지·로고·폰트의 복사, 다운로드, 핫링크.
