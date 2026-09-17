# 회원 인증·DB 관리 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고아 커뮤니티에 일반 회원 가입·로그인과 운영자 회원 관리, 안전한 DB 조회·수정 기능을 추가한다.

**Architecture:** SQLite에 `users` 계정 테이블과 기존 세션의 `user_id`를 추가한다. 일반 인증은 `/api/auth/*`, 운영자 기능은 기존 관리자 세션으로 `/api/admin/*`에 둔다. DB 화면은 허용된 테이블과 필드만 편집하는 모달을 사용해 원본 SQL 입력 없이 수정한다.

**Tech Stack:** Node.js 24 native HTTP server, `node:sqlite`, vanilla HTML/CSS/JavaScript, native `scrypt` password hashing.

**Spec:** User request in the conversation on 2026-09-17.

## Global Constraints

- 기존 게스트 글쓰기·댓글·관리자 비밀번호 흐름은 계속 동작해야 한다.
- 비밀번호 해시와 관리자 비밀값은 API 응답과 DB 화면에 노출하지 않는다.
- 회원 `운영자` 닉네임은 일반 회원이 사용할 수 없고 운영자 세션에서만 허용한다.
- DB 편집은 서버의 허용 필드와 입력 검증을 거친다.
- Node.js 24 이상과 추가 npm 패키지 없이 실행한다.

---

### Task 1: 사용자 계정 스키마와 인증 API

**Files:**
- Modify: `db.mjs`
- Modify: `server.mjs`
- Modify: `security.mjs` only if shared validation needs a new helper
- Create: `test/auth.test.mjs`

**Interfaces:**
- Produces `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Extends `/api/bootstrap` with `user: {id,username,nickname,role}` or `null`.
- Adds `users(id,username,nickname,password_hash,role,status,created_at,last_login)` and `sessions.user_id` with migration for existing DBs.

- [ ] Write failing tests for signup validation, duplicate username/nickname, `운영자` blocking, login/me/logout, blocked accounts, and logged-in session persistence.
- [ ] Run `node --test test/auth.test.mjs` and confirm the new assertions fail before implementation.
- [ ] Add the users table, idempotent `sessions.user_id` migration, and indexes in `db.mjs`.
- [ ] Add scrypt-backed signup/login routes, cookie session rotation, account status checks, and sanitized bootstrap user data in `server.mjs`.
- [ ] Keep guest posting available while using the logged-in account nickname when a user session is present.
- [ ] Run the focused auth test and the full suite; confirm all pass.

### Task 2: User-facing login and signup UI

**Files:**
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `사용안내.md`

**Interfaces:**
- Produces `#/login`, `#/signup`, and `#/account` routes.
- Uses bootstrap `user` state to show login/signup or account/logout links in the shared header.

- [ ] Add DC-style compact authentication screens with username, nickname, password, and confirmation fields.
- [ ] Wire forms to `/api/auth/*`, refresh bootstrap after login/logout, and show validation errors without leaking server details.
- [ ] Prefill logged-in post/comment nickname and keep guest forms working.
- [ ] Add responsive styling and user-facing instructions for account management.
- [ ] Verify the routes in the browser at desktop and narrow widths.

### Task 3: Operator user management

**Files:**
- Modify: `server.mjs`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Create or modify: `test/admin-management.test.mjs`

**Interfaces:**
- Produces `GET /api/admin/users` and `PATCH /api/admin/users/:id` for nickname, role, and active/blocked status.
- Produces `#/admin/users` with block/unblock and role controls.

- [ ] Test admin-only access, sanitized user list, blocking a user, unblocking a user, and rejecting invalid role/status values.
- [ ] Add the allowlisted admin routes; prevent changing the administrator password through user APIs.
- [ ] Add an operator management screen linked from the existing admin page.
- [ ] Verify a blocked account cannot log in or use an existing session.

### Task 4: Safe DB inspection and editing

**Files:**
- Modify: `server.mjs`
- Modify: `public/app.js`
- Modify: `public/style.css`
- Modify: `test/database-viewer.test.mjs`

**Interfaces:**
- Extends `/api/admin/database` with a sanitized `users` table.
- Produces `PATCH /api/admin/database/:table/:id` for allowlisted fields in posts, comments, galleries, settings, and users.

- [ ] Test admin-only editing, valid field updates, settings validation, unknown table/field rejection, and no credential leakage.
- [ ] Implement table-specific field maps and use parameterized SQLite statements only.
- [ ] Add edit buttons and a modal form to the DB viewer; keep password hashes, sessions, votes, and views out of editable UI.
- [ ] Show the actual SQLite path and explain the UI flow in `사용안내.md`.
- [ ] Verify edits appear immediately in the gallery, post, and account views.

### Task 5: Integration verification

**Files:**
- Modify: `사용안내.md` if final copy needs correction.

- [ ] Run `node --check server.mjs`, `node --check public/app.js`, and `node --test test/*.test.mjs`.
- [ ] Restart the Node server and quick tunnel.
- [ ] Verify the public health endpoint, login/signup routes, admin user screen, and DB viewer from the shared URL.
- [ ] Leave the public community page open for the user.
