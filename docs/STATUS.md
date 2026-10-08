# STATUS

## 2026-08-26 — M0 + M1 완료 (최소 출시 라인 도달)

프로젝트 최초 스캐폴드부터 M1(핵심 검색) 전체를 하루에 구축.

**M0 — 발판**
- Vite + React 19 + Tailwind v4 스캐폴드, Cloudflare Pages/Functions + wrangler 설정
- D1 스키마(`db/schema.sql`) — 신규 DB 생성 없이 `edu-link-db` 공유, `edudic_` 접두어로 멱등 적용
- krdict 인증키 발급 완료, `.dev.vars` / `.dev.vars.example` 구성
- 브랜딩: `logo.png` 기반 favicon/apple-touch-icon/OG 카드/PWA 매니페스트

**M1 — 핵심 검색(웹 v1)**
- `functions/api/lookup.ts`: 금칙어 프리필터 → D1 캐시 → krdict 검색+상세 정규화 → 캐시 저장
- `functions/api/popular.ts`: 최근 30일 인기 낱말 집계
- `functions/api/related.ts`, `functions/api/simplify.ts`: 관련어·쉬운말 변환 (Timely AI 게이트웨이, 키 없으면 조용히 생략)
- 텍스트·이미지 소스 우선순위 파이프라인: krdict → encykorea(텍스트 대체 / 이미지 2차) → 네이버(이미지 3차 폴백) — `functions/lib/{krdict,encykorea,naver,dictionary}.ts`
- 동음이의어 전환 탭 — 뜻별 독립 이미지/소리/쉬운말 캐시
- 검색 결과 `/낱말` 경로 공유 지원(구 `?q=` 링크 호환)
- 홈 화면: 대형 검색창 + 4열(내가 찾은 · 즐겨찾기 · 자주 찾는 · 추천)
- `/my` 나의 낱말사전 페이지: 활동 탭 + 낱말 익히기 카드 + 수준/관심주제 설정
- "큰 화면(발표)" 모드 — 교실 투사용 확대 레이아웃
- 컴포넌트: `SearchBox`, `ResultCard`, `WordChips`, `Modal`, `UsageGuide`, `ResourceLinks`
- localStorage 기반 최근 검색/즐겨찾기 (`app/lib/storage.ts`)

## 2026-08-26 — M2 완료 및 사용자 관심 주제 AI 생성·공유 & UI/UX 고도화

M2(자주 찾는 낱말 D1 집계 고도화, 11개 낱말 배우기 코너 확장) 및 PLAN.md §13 향후 로드맵(사용자 관심 주제 추가 + 네이버 웹문서 연계 AI 어휘 수집 & krdict 사전 접지 검증 & dgedu.link 공유) 전면 구현 및 UI/UX 디테일 개선 완료.

**1. M2 — 낱말 코너 및 집계 고도화**
- `functions/api/popular.ts` & D1 `edudic_popular_daily`: 최근 30일 일일 버킷 기반 전역 인기 낱말 집계 및 랭킹 조회
- `app/lib/words.ts`: 초등 11개 주제별 어휘 세트 구축 (자연·학교·감정·우리집·음식·동물·탈것·몸·옷·동네·놀이 등 300+개 검증 어휘)
- `/my` 나의 낱말사전: 개인 로컬 집계(내가 자주 찾은 낱말)와 전역 인기 분리

**2. 사용자 정의 관심 주제 추가 & AI 낱말 자동 생성 (PLAN.md §13)**
- `functions/api/topic-words.ts` [NEW]:
  - **네이버 웹문서 API(`searchNaverWeb`, NCP search/v1/webkr) 연계**: '24절기', '전통 악기' 등 특정/복합 주제 입력 시 웹문서 스니펫을 AI 참고 컨텍스트로 제공 → 뻔한 상위어(봄/여름 등) 대신 구체적 세부 낱말(입춘, 경칩, 하지, 동지 등)을 정확히 포착
  - **krdict 사전 접지(Grounding)**: AI 후보 낱말을 국립국어원 사전 API(`searchWord`)로 1:1 실존 검증 후 반환 (환각 및 미수록 단어 원천 방지)
- `im-not-ai` 문구 정제: 자연스럽고 신뢰감 있는 교육용 표현으로 전면 수정 (*"궁금하거나 배우고 싶은 주제를 적으면, 알맞은 쉬운 낱말을 사전에서 골라 모아줘요."*, *"사전에서 낱말 모으기"*)
- `functions/api/share-topic.ts` [NEW] & `dgedu.link` 단축 URL 공유:
  - `DGEDU_LINK_API_KEY` 연동으로 커스텀 주제 단축 공유 링크 생성
  - 공유 링크(`?shareTopic=...`) 진입 또는 주제 추가 시 해당 카드에 **부드러운 번쩍임(플래시/펄스) 애니메이션** 적용

**3. 랜딩 및 낱말 결과 화면 UI/UX 개선**
- **랜딩 레이아웃 여백 & 하단 Footer**:
  - 검색창 영역 패딩 대폭 확보: 상단 100px+ (`pt-[100px] sm:pt-[120px]`), 하단 180px+ (`pb-[180px] sm:pb-[200px]`)
  - "함께 보면 좋은 곳"을 `min-h-[calc(100vh-3.5rem)] flex flex-col justify-between` 구조와 `mt-auto`로 화면 최하단(Footer 영역)에 안정적으로 배치
- **낱말 화면 디테일**:
  - 표제어 헤더 하단 여백 확대 (`mt-8 sm:mt-10`)
  - **쉬운 말 AI 프롬프트 및 후처리(`cleanEasyDef`) 개선**: `~를 말하는 거야` 등 불필요한 설명형 어미를 배제하고 `"아직 어린 소."` 같은 사전식 간결한 명사구 종결 보장
  - **쉬운 예문 생성 & 정확한 낱말 하이라이트**: "쉬운 말로" 모드 시 어린이 일상 예문을 동시 생성하며, 뒤따르는 조사를 제외하고 해당 낱말만 정확하게 분리하여 형광펜 하이라이트(`HighlightWord`) 적용

## 2026-08-26 — M3 & M4 완료 (웹 다듬기·초성 자동완성 & '어린이 쉬운 사전 데스크탑' 스팟라이트 앱)

PLAN.md의 M3(초성 검색 및 실시간 자동완성, 접근성·에러 UX 다듬기, im-not-ai 문구 정제) 및 M4(Tauri v2 기반 '어린이 쉬운 사전 데스크탑' PC 스팟라이트 앱, 트레이 상주, 전역 단축키, R2 기반 NSIS 자동 업데이트) 전면 구현 완료.

**1. M3 — 초성 검색 & 실시간 자동완성 & im-not-ai 문구 정제**
- `functions/lib/choseong.ts` [NEW]: 한글 음절 유니코드 분해 공식 기반 초성 추출(`extractChoseong`) 및 초성/접두사 매칭 판별(`matchesChoseongOrPrefix`, `isChoseongOnly`)
- `functions/api/suggest.ts` [NEW]: `GET /api/suggest?q=...` — D1 `edudic_dict_cache`에 누적된 낱말 + 초등 11개 주제 300+개 큐레이션 단어 대상 초성/접두사 실시간 자동완성 API
- `app/components/SearchBox.tsx`: 디바운스된 실시간 자동완성 드롭다운 (키보드 ↑/↓/Enter/ESC 지원, 클릭 시 바로 사전 조회)
- `app/components/UsageGuide.tsx`: PC 스팟라이트 앱 소개 및 바로 다운로드 링크 연계, 전체 문구 친근하고 단정한 교육적 어투(`im-not-ai`) 적용

**2. M4 — '어린이 쉬운 사전 데스크탑' (PC 스팟라이트 앱)**
- `desktop/` [NEW]: `edu-team`의 검증된 Tauri v2 아키텍처 패턴 적용
  - 앱 이름: **어린이 쉬운 사전 데스크탑** (`link.dgedu.dic.desktop`)
  - **전역 단축키(`Ctrl+Shift+D`)**: 언제 어디서든 화면 중앙에 슬림 스팟라이트 검색창 노출
  - **시스템 트레이 상주**: 닫기(X)/ESC 시 백그라운드 숨김, 트레이 메뉴(사전 열기, 웹 사전 열기, 종료)
  - **스팟라이트 검색 → 웹 대형 결과 연동**: 슬림 검색바에서 낱말이나 초성 입력 후 Enter 또는 클릭 시, 웹 사전(`/낱말`)이 브라우저에서 대형 화면으로 즉시 열리며 스팟라이트 창은 자동 숨김
  - **R2 기반 NSIS 배포 & 자동 업데이트**:
## 2026-08-26 — 동형이의어 `#` 해시 연동, 커스텀 주제 탐색 AI 추천 & 데스크탑 v0.2.2 릴리스

1. **동형이의어 `#` URL 해시 바로가기 & 공유 연동**
   - URL 뒤 `#1`, `#2`, `#3` 해시로 특정 동음이의어 뜻풀이에 직접 진입 (`https://dic.dgedu.link/우수#3`)
   - 동음이의어 번호 탭 클릭 시 주소창 해시 실시간 동기화 (`history.replaceState`) 및 `hashchange` 이벤트 리스너 등록
   - 데스크탑 앱의 `'누리집에서 보기'` 클릭 시에도 선택된 동음이의어 해시 번호를 붙여 브라우저 오픈

2. **커스텀 낱말사전 소속 주제 탐색 & 맥락 기반 AI 비슷한 낱말 추천**
   - `functions/api/related.ts`: D1 `edudic_shares` 테이블에서 검색 낱말이 포함된 커스텀 주제를 역탐색하여 형제 낱말 및 주제명 추출
   - 소속 주제 컨텍스트를 주입받은 AI가 단어와 가장 밀접한 초등 추천 어휘를 스마트하게 생성 (`AI 비슷한 낱말 ✨`)
   - 공유받은 주제에는 `[공유 받음]`(노란색 뱃지), 직접 생성한 주제에는 `[직접 만듦]`(파란색 뱃지) 구분 표기

3. **자동완성 드롭다운 및 검색창 UX 최적화**
   - 추천 낱말 개수를 가장 적절한 상위 10개로 최적화
   - 검색창 placeholder 텍스트 간소화로 좁은 화면/버튼 인접 시 잘림 현상 방지 (`"궁금한 낱말이나 초성을 적어보세요"`)
   - 검색 실행 또는 추천어 선택 시 자동완성 드롭다운 즉시 닫기 및 포커스 해제 처리
   - 새 관심 주제 만들기 모달 서브타이틀 한 줄 정렬 (`"주제를 적으면 알맞은 쉬운 낱말을 사전에서 골라 모아줘요."`)
   - Gemini API 직접 폴백 모델을 `gemini-flash-lite-latest`로 안정화

4. **데스크탑 v0.2.2 릴리스 & 교실 화이트보드 전체화면 모드 지원**
   - `Ctrl+Alt+D` 전역 단축키 충돌 방지 및 시스템 트레이 메뉴에 현재 버전(`v0.2.2`) 표기
   - 상단 전체화면 버튼 / `F11` 누를 시 모니터 100% 가득 채우는 깨끗한 화이트보드 대형 모드 전환 지원
   - 국립국어원 공식 발음 MP3 + 한국어 Web Speech API TTS 발음 읽기 지원
   - 출처 다중 표기 (`출처: 국립국어원 한국어기초사전, 네이버 이미지 검색`)
   - Minisign 암호화 디지털 서명 완료 및 Cloudflare R2(`edu-dic-downloads`) 배포 완료



## 2026-10-09 — 첫 조회 속도 개선 + AI 모델 luna 교체 (`docs/perf-plan.md`)

실측 원인: 한국 사용자 요청이 **파리(CDG) 엣지**에서 실행(`loc=KR colo=CDG`)되어 krdict·네이버·Timely를 매번 파리↔한국 왕복, 사진 보완(네이버+AI 심사)이 첫 응답을 붙잡음, `/api/related`의 krdict 검증 직렬(운영 25.9초).

- **실행 위치**: `wrangler.jsonc` `placement: smart` + `public/_routes.json`(Functions는 `/api/*`·`/download/*`만, 정적 파일은 Functions 우회). pages.dev 리다이렉트는 HTML은 `index.html` 스크립트, API는 미들웨어.
- **뜻 먼저, 사진은 뒤이어**: `/api/lookup?defer=1` → `imagePending` 표시, 새 `/api/image`가 채움. 웹은 "사진 찾는 중…" 자리표시. `defer` 없는 데스크탑 앱은 기존 동작 유지.
- **병렬화**: related·topic-words 후보 검증, 미수록어 오타 변환+AI 추측 동시 시작. related는 캐시가 없어도 krdict 재조회 안 함.
- **캐시 경합 수정**: simplify·related·image·image-action이 항목 전체를 덮어쓰던 것을 `patchCachedEntry`(D1 `json_set`/`json_remove`) 필드 단위 갱신으로.
- **타임아웃**: 모든 외부 fetch에 `AbortSignal.timeout`(krdict 5초·래퍼 3초·encykorea 3초·네이버 2.5~3초·AI 10초, 주제 낱말 15초).
- **자동완성**: 낱말 풀을 isolate 메모리에 5분 캐시(글자마다 D1 두 번 읽던 것 제거). 웹은 세션 안에서 본 낱말을 메모리에서 바로 표시.
- **AI**: Timely 기본 `openai/gpt-5.6-luna` + `reasoning_effort: "none"`(추론 토큰 0, 약 1.5초), `json` 모드·호출별 타임아웃. 사진 번호 고르기만 `google/gemini-2.5-flash-lite` 유지(luna가 6낱말 중 3낱말에서 답이 흔들림).
- 버그: `image-action` 오류 응답이 200으로 나가던 것, 기존 타입 오류 4건 수정(`tsc --noEmit` 통과).

로컬(`wrangler pages dev`, 한국 PC) 실측: 처음 찾는 낱말 뜻 0.4~0.7초 → 사진 1.3~1.9초 뒤 표시, 관련어 약 2초, 쉬운 말 1.7~2초, 재방문 0.15초. 동시 저장(사진·관련어·쉬운 말 h0/h1) 모두 보존 확인.
배포 후 확인할 것: 응답 헤더 `cf-placement`(remote-ICN 등), 운영 첫 조회 시간, encykorea(`:8080` 포트) 호출이 엣지에서 정상인지 로그.
