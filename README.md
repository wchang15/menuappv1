# menu

## Supabase 통합 가이드

아래 순서대로 진행하면 앱에서 Supabase 인증/스토리지/DB 파이프라인을 사용할 수 있습니다.

### 인증 데이터는 어디에 저장되나요?
- 이메일/패스워드, 소셜 로그인 정보는 **Supabase Auth**가 관리하며, 앱 서버(Next.js)에는 원본 자격 증명이 저장되지 않습니다.
- `/api/assets/presign` 엔드포인트는 **클라이언트가 로그인해 받아온 Supabase JWT**가 있어야만 동작합니다. 즉, 사용자는 Supabase Auth를 통해 계정을 만들고 로그인해야 합니다.
- 서버에서 사용하는 Service Role Key는 환경 변수로만 주입하며 클라이언트로 노출하지 않습니다.

### 1) 프로젝트 생성 및 리전 선택
- [Supabase 대시보드](https://supabase.com/dashboard)에서 새 프로젝트를 만들고 조직/리전을 선택합니다.
- **Project URL** 과 **anon/service role key** 를 복사해 `.env.local`에 추가합니다.

### 2) Auth 설정
- **Authentication → Providers**에서 **Email/Password**를 활성화합니다.
- Google, Kakao 등 필요한 OAuth 공급자도 동일 메뉴에서 추가하고 Redirect URL을 앱 도메인에 맞게 등록합니다.

### 3) 데이터베이스 테이블 + RLS
- SQL Editor에서 다음 테이블을 준비합니다. (기본 `users` 테이블은 Supabase가 제공합니다.)
- `assets`
  ```sql
  create table if not exists public.assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    path text not null,
    filename text not null,
    content_type text,
    size_bytes bigint,
    upload_token text,
    status text default 'pending_upload',
    created_at timestamptz default now()
  );
  ```
- `menus`
  ```sql
  create table if not exists public.menus (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    name text not null,
    layout jsonb,
    cover_asset_path text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  ```
- 두 테이블 모두 **RLS On** 으로 켜고, 기본 정책을 추가합니다.
  ```sql
  -- 본인 데이터만 보기/쓰기 허용
  create policy "Users can read own assets" on public.assets
    for select using (auth.uid() = user_id);
  create policy "Users can insert own assets" on public.assets
    for insert with check (auth.uid() = user_id);
  create policy "Users can read own menus" on public.menus
    for select using (auth.uid() = user_id);
  create policy "Users can write own menus" on public.menus
    for insert with check (auth.uid() = user_id);
  create policy "Users can update own menus" on public.menus
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

### 4) 스토리지 버킷
- **Storage → Buckets**에서 `assets` 버킷을 만들고 **Private** 로 설정합니다.

### 5) 업로드용 사전 서명 URL API (Next.js Route Handler)
- `app/api/assets/presign/route.js` 는 사용자의 Supabase JWT를 받아 `assets` 버킷에 5분짜리 업로드 URL을 발급하고, `assets` 테이블에 메타데이터를 기록합니다. 필요한 환경 변수:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (RLS 우회를 위한 서버 전용)
- 요청/응답 예시:
  ```bash
  curl -X POST https://<app>/api/assets/presign \
    -H "Authorization: Bearer <supabase_access_token>" \
    -H "Content-Type: application/json" \
    -d '{"filename":"menu-bg.png","contentType":"image/png","sizeBytes":204800}'
  # 응답
  # {
  #   "uploadUrl": "https://<project>.supabase.co/storage/v1/upload/...",
  #   "token": "...",
  #   "path": "<user-id>/<timestamp>-menu-bg.png",
  #   "metadata": { ... 레코드 ... }
  # }
  ```

### 6) 클라이언트 플로우
1. 사용자가 로그인 → `supabase.auth.signInWithPassword` 또는 OAuth로 JWT 획득.
2. 업로드할 때 `/api/assets/presign`을 호출해 `uploadUrl`을 받음.
3. `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })` 로 업로드.
4. 업로드 완료 후 필요 시 `assets` 테이블의 `status` 컬럼을 `uploaded`로 PATCH (REST 또는 Supabase 클라이언트 사용).
5. `menus` 테이블에 업로드한 `path`를 연결하여 메타데이터를 저장.

### 7) CDN/가속
- **Storage → Settings**에서 Supabase가 제공하는 가속 옵션(고가용성 CDN)을 켭니다.
- 혹은 Cloudflare/CloudFront와 연동할 경우 서명 URL을 그대로 캐시하도록 설정합니다.

### 8) 백업 & 모니터링
- **Database → Backups**에서 PITR(포인트인타임 복구)와 자동 백업 스케줄을 활성화합니다.
- **Reports → Logs/Monitors**에서 Auth 실패, Storage 업로드 오류를 모니터링 알림으로 설정합니다.
- 필요 시 [pg_cron](https://supabase.com/docs/guides/database/extensions/pgcron) 으로 주기적인 청소 작업(만료 업로드 정리 등)을 추가합니다.

### 환경 변수 예시(`.env.local`)
```
SUPABASE_URL=https://xyzcompany.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1Ni...
```

### 추가 메모
- `status` 컬럼은 "pending_upload" → "uploaded" → "archived" 등 워크플로우에 맞게 확장 가능합니다.
- iOS/웹 모두 같은 API를 쓰며, Capacitor 배포 시 `.env`를 안전하게 주입하세요.
