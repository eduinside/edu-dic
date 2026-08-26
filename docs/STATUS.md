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

## 2026-08-26 — M2 완료 및 사용자 관심 주제 AI 낱말 생성 추가

M2(자주 찾는 낱말 D1 집계 고도화, 11개 낱말 배우기 코너 확장) 및 PLAN.md §13 향후 로드맵(사용자 관심 주제 추가 + AI 낱말 추천 & krdict 사전 접지 검증) 구현 완료.

**M2 + 로드맵 주요 구현 내용**
- `functions/api/popular.ts` & D1 `edudic_popular_daily`: 최근 30일 일일 버킷 기반 전역 인기 낱말 집계
- `app/lib/words.ts`: 초등 11개 주제별 어휘 세트 구축 (자연·학교·감정·음식·동물·탈것·몸·옷·동네·놀이 등)
- `functions/api/topic-words.ts` [NEW]: 사용자 입력 주제에 대한 AI(Timely/Gemini) 낱말 생성 및 krdict `searchWord` 사전 접지(Grounding) 실존 검증
- `app/lib/storage.ts`: `edudic.customTopics` 기반 커스텀 주제 CRUD 지원 (로그인 없는 D6 원칙)
- UI: `/my` 나의 낱말사전 내 `[+ 새 주제]` 생성 모달, AI 낱말 생성 및 수동 추가/삭제, 이모지 선택, 카드 아코디언 및 삭제 기능 연동

**다음 단계**: M3(접근성 및 오프라인/에러 UX 다듬기, 도메인 연결) — [PLAN.md §8](PLAN.md) 참고.
