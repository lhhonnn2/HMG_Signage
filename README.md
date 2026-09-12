# TV 사이니지 시스템

태안 센터 TV 5대용 이미지 루핑 + 알람 방송 웹앱.

- 이미지/폰트/음원 파일 저장: **Cloudflare R2** (egress 무료 — 파일이 아무리 자주 로드돼도 트래픽 비용 없음)
- 스케줄/설정 데이터: **Supabase** (Postgres + Realtime)
- 앱 호스팅: **Vercel** (무료 티어) — 이미지 자체는 R2에서 직접 브라우저로 서빙되므로 Vercel 대역폭은 거의 쓰지 않음

## 1. Supabase 설정

1. https://supabase.com 에서 새 프로젝트 생성
2. 프로젝트 > SQL Editor 에서 `supabase/schema.sql` 내용을 그대로 실행
3. 프로젝트 > Settings > API 에서 다음 값을 복사해둠
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (절대 클라이언트에 노출되지 않도록 주의 — 서버 API 라우트에서만 사용됨)

## 2. Cloudflare R2 설정

1. Cloudflare 대시보드 > R2 > **Create bucket**, 이름 예: `tv-signage`
2. 버킷 > Settings > **Public access**를 켜고 r2.dev 개발용 URL을 활성화 (또는 직접 보유한 도메인을 연결). 이 URL이 `R2_PUBLIC_BASE_URL`
3. R2 > **Manage API tokens** > Create API token (버킷 읽기/쓰기 권한) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` 발급
4. Cloudflare 계정 대시보드 우측에 있는 **Account ID**를 복사 → `R2_ACCOUNT_ID`
5. 버킷 > Settings > **CORS Policy**에 아래와 같이 추가 (배포될 Vercel 도메인을 실제 도메인으로 교체):

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"]
  }
]
```

이 CORS 설정이 없으면 관리자 페이지에서 이미지를 올릴 때 브라우저가 R2로의 직접 업로드(PUT)를 막습니다. 로컬 개발 중에는 `http://localhost:3000`도 같이 추가해두면 편합니다.

## 3. 로컬 환경변수

`.env.example`을 `.env.local`로 복사하고 위에서 발급한 값을 채워 넣습니다. `ADMIN_PASSWORD`는 관리자 페이지 접속용 비밀번호로 원하는 값을 직접 정하면 됩니다.

## 4. 설치 및 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 → 관리자 페이지(`/admin`)와 TV별 송출화면(`/player/1` ~ `/player/5`) 확인.

## 5. Vercel 배포

1. 이 프로젝트를 GitHub 저장소로 올림
2. https://vercel.com 에서 New Project → 해당 저장소 선택
3. Environment Variables에 `.env.local`의 모든 값을 동일하게 등록 (`NEXT_PUBLIC_...`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_...`, `ADMIN_PASSWORD`)
4. Deploy
5. 배포된 도메인이 확정되면 2번의 R2 CORS `AllowedOrigins`를 실제 도메인으로 다시 저장

## 6. 각 TV에서 여는 방법

각 TV에 연결된 PC/셋톱박스의 브라우저에서 아래 주소를 **전체화면(F11 등 키오스크 모드)**으로 열어두면 됩니다.

```
https://your-app.vercel.app/player/1
https://your-app.vercel.app/player/2
https://your-app.vercel.app/player/3
https://your-app.vercel.app/player/4
https://your-app.vercel.app/player/5
```

브라우저 자동재생(오토플레이) 정책 때문에 알람 음원이 처음 한 번은 재생되지 않을 수 있습니다. 크롬을 `--autoplay-policy=no-user-gesture-required` 플래그로 실행하거나, 해당 사이트를 크롬 설정 > 사이트 설정 > 소리에서 "허용"으로 지정해두면 문제없이 자동재생됩니다.

## 기존에 이미 배포해서 쓰고 있었다면 (마이그레이션)

이전 버전의 `schema.sql`을 이미 Supabase에 실행한 적이 있다면, 이번 업데이트는 테이블 구조가 바뀌었으므로 SQL Editor에서 `supabase/migration_v2.sql`을 한 번 실행해야 합니다. 처음 설치하는 경우에는 필요 없고 `schema.sql`만 실행하면 됩니다.

## 이번 업데이트로 추가된 기능

- **이미지 템플릿**: `/admin/image-templates`에서 자주 쓰는 이미지 묶음을 이름 붙여 저장해두고, TV 설정 화면에서 "템플릿에서 추가" 드롭다운으로 한 번에 재생목록에 넣을 수 있습니다.
- **TV별 독립 알람**: 알람이 더 이상 여러 TV에 동시 배정되지 않고, TV 1~5 각각 완전히 별도의 알람 목록을 가집니다. `/admin/alarms`에서 TV 탭을 눌러 전환합니다.
- **엑셀 시트처럼 바로 수정**: 알람 목록이 표로 보이고, 칸을 클릭해 바로 수정하면 커서가 칸을 벗어나는 순간 자동 저장됩니다. 추가도 삭제도 표 안에서 바로 됩니다.
- **엑셀 업로드 컬럼 단순화**: 날짜 · 알람시각 · 시작예정시각 · 프로그램명 · 렉처룸, 5개 컬럼만 사용합니다. TV는 업로드할 때 선택된 탭으로 자동 지정되고, 글자 크기·폰트는 아래 "알람 서식 설정"에서 전체 공통으로 적용됩니다.
- **알람 문구 직접 수정**: `/admin/settings`에서 알람 화면에 뜨는 문구 자체([프로그램명], [장소], [시작시간] 자리표시자 포함)를 자유롭게 고칠 수 있고, 줄마다 글자 크기도 따로 지정할 수 있습니다.
- **관리자 화면에서 TV 화면 바로가기**: 왼쪽 메뉴 하단과 TV 설정/알람 화면 상단에 있는 "TV n ↗" 버튼을 누르면 새 탭에서 해당 TV의 실제 송출화면이 열립니다.
- **디자인 개선**: 전체적으로 카드/버튼/입력창 스타일을 다듬었습니다.

## 알아두어야 할 부분 (현재 구현의 가정/한계)

- **관리자 인증**: `/admin`은 Next.js 미들웨어 단의 간단한 공유 비밀번호 게이트입니다. 다만 관리자 화면은 Supabase **anon key**로 직접 DB에 쓰기 때문에, 배포된 사이트의 JS 번들에서 anon key를 추출하면 비밀번호 없이도 DB에 쓰는 것이 기술적으로 가능합니다. 신뢰할 수 있는 내부 직원만 접근한다는 전제라면 문제없지만, 더 엄격한 보안이 필요하면 쓰기 작업을 서버 API 라우트(`SUPABASE_SERVICE_ROLE_KEY` 사용)로 옮기고 RLS를 읽기 전용으로 잠그는 방향으로 바꿔야 합니다.
- **알람 음원**: TV별로 "이 TV는 알람 중 음원을 재생함" 여부와 파일 1개를 설정하는 구조입니다. 즉 그 TV에서는 어떤 알람이 뜨든 같은 음원이 재생됩니다. 알람마다 다른 음원을 쓰고 싶다면 `alarms` 테이블에 `audio_url` 컬럼을 추가하는 식으로 확장이 필요합니다.
- **엑셀 업로드 형식**: `/admin/alarms`에서 TV 탭을 먼저 선택한 뒤 "템플릿 다운로드"로 양식을 받아 채워서 업로드합니다. 컬럼: 날짜, 알람시각, 시작예정시각, 프로그램명, 렉처룸. 업로드된 알람은 전부 그 시점에 선택돼 있던 TV에만 등록됩니다.
- **알람시각 vs 시작예정시각**: "알람시각"은 검은 알람 화면이 실제로 뜨기 시작하는 시각이고, "시작예정시각"은 알람 문구 안 "시작 시간 : "에 표시되는, 실제 프로그램이 시작하는 시각입니다. 프로그램 시작 10분 전에 미리 알람을 띄우고 싶다면 알람시각을 시작예정시각보다 10분 이르게 넣으면 됩니다. 둘을 같게 넣으면 알람이 뜨는 순간이 곧 프로그램 시작 시간이 됩니다.
- **동시 알람 판단 기준**: 같은 TV의 알람들 중 현재 시각이 [알람시각, 알람시각+노출시간] 구간에 겹치는 것들을 "동시 알람"으로 봅니다. 1개=전체화면, 2개=좌우 2분할, 3개 이상=5초 간격으로 순차 로테이션(원하는 간격이 있으면 `src/app/player/[tvId]/page.tsx`의 `ROTATE_EVERY_MS` 값을 조절하세요).
- **이미지 전환 방식**: 현재는 별도 전환 효과 없이 지정한 초 간격으로 바로 다음 이미지로 바뀝니다. 페이드 효과가 필요하면 추가 요청해주세요.

## 다음에 요청하면 좋을 것들

- 이미지 크로스페이드 전환 효과
- 알람별 개별 음원 지정
- 관리자 쓰기 작업을 서버 API로 옮겨 보안 강화
- TV 재생목록 순서를 드래그로 정렬
