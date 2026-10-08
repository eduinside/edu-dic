# 첫 조회 속도 개선 + AI 모델 교체 계획 (2026-10-09)

## 1. 실측 (2026-10-09, 교사 PC → 운영 dic.dgedu.link)

| 항목 | 결과 |
|---|---|
| `/cdn-cgi/trace` | `loc=KR`인데 **`colo=CDG`(파리)** — 무료 플랜 한국 트래픽이 파리 엣지로 감 |
| 처음 찾는 낱말 `/api/lookup` | 5.8~6.2초, 1회는 22초 후 502 |
| 캐시된 낱말 `/api/lookup` | 약 1.0초 |
| 처음 찾는 낱말 `/api/related` | **25.9초**(두 번째 낱말 6.7초) |
| `/api/simplify` | 3.2~4.8초 |
| 정적 파일 `logo.png` | 2.4초(전역 `_middleware.ts` 때문에 정적 파일도 Functions를 거침) |

같은 호출을 한국 PC에서 직접 하면: krdict 검색+상세+미디어 래퍼 합계 약 0.5초, 네이버 이미지 약 1초, encykorea 0.2~1.5초.
→ 느림의 대부분은 **파리 엣지 ↔ 한국 API 왕복**과 **직렬 호출**이다.

AI(Timely, 한국 PC 기준, 쉬운 말 JSON 1건):

| 모델·옵션 | 응답 | 추론 토큰 |
|---|---|---|
| `google/gemini-2.5-flash-lite` | 약 1.2초 | 0 |
| `openai/gpt-5.6-luna` 기본 | 2.0~3.0초 | 27~45 |
| `openai/gpt-5.6-luna` + `reasoning_effort: "none"` | **약 1.5초** | 0 |

## 2. 변경

### 2.1 실행 위치
- `wrangler.jsonc`에 `placement: { mode: "smart" }` — Functions를 백엔드(krdict·네이버·Timely, 모두 한국) 가까이에서 실행. 무료 플랜 지원. 배포 후 수 분~15분 분석이 필요하고 `cf-placement` 응답 헤더로 확인.
- `public/_routes.json`으로 Functions를 `/api/*`, `/download/*`에만 연결. 정적 파일·SPA 페이지는 Functions를 거치지 않는다(Smart Placement 문서의 "전역 미들웨어가 있으면 정적 파일도 백엔드 근처에서 서빙" 제약 회피 + 무료 요청 한도 절약).
  - `*.pages.dev` → 정본 도메인 리다이렉트는 HTML은 `index.html` 인라인 스크립트, API는 기존 미들웨어가 맡는다.

### 2.2 첫 조회: 뜻 먼저, 사진은 뒤이어
- `/api/lookup?defer=1`: krdict(뜻·krdict 삽화·발음)만으로 바로 응답하고, 사진이 없는 항목에 `imagePending: true`를 붙여 캐시에 저장(응답 전 저장 완료).
- 새 `/api/image?q=`: 대기 중인 사진(encykorea·네이버+AI 심사)을 채우고 캐시를 필드 단위로 갱신해 돌려준다.
- 웹은 `defer=1`로 부르고 사진 칸에 "사진 찾는 중" 자리표시를 보여 준다. `defer` 없이 부르는 데스크탑 앱(v0.3.0)은 기존처럼 사진까지 채운 뒤 응답 — 캐시에 대기 표시가 남아 있으면 그 자리에서 채운다.

### 2.3 직렬 → 병렬
- `/api/related`: AI 후보 krdict 검증을 병렬로. 캐시 항목이 없을 때 krdict 전체 재조회를 하지 않는다(관련어에는 표제어만 필요).
- `/api/topic-words`: 후보 검증 병렬.
- 미수록어 교정: 네이버 오타 변환과 AI 추측을 동시에 시작하고 오타 변환을 우선.

### 2.4 캐시 저장 경합
- simplify·related·image가 각자 항목 전체를 읽고-덮어써서, 동시에 끝나면 서로의 필드(쉬운 말·관련어·사진)를 지웠다. D1 `json_set`/`json_remove`로 해당 필드만 갱신한다(`patchCachedEntry`).

### 2.5 기타
- 모든 외부 fetch에 타임아웃(`AbortSignal.timeout`) — 22초 매달림 방지.
- 자동완성 `/api/suggest`: 낱말 풀(D1 1,000개 + 인기 50개)을 isolate 메모리에 5분 캐시. 글자마다 D1을 두 번 읽던 것 제거.
- 웹 프런트: 이번 세션에서 이미 본 낱말은 메모리에서 바로 보여 준다(뒤로 가기·다시 누르기).
- `image-action`의 오류 응답이 200으로 나가던 버그(`json(data, 400)`) 수정.

### 2.6 AI 모델
- Timely 기본 모델 `openai/gpt-5.6-luna`(byeduin `_ai.js`의 `DEFAULT_TIMELY_MODEL`과 동일), `reasoning_effort: "none"`.
- `json` 옵션 → Timely `response_format: {type: "json_object"}` / Gemini `responseMimeType`. 쉬운 말 출력은 `{"items": [...]}` 객체로 바꿈(배열 응답도 계속 허용).
- 호출별 `timeoutMs`. 이미지 심사 타임아웃 1.2초 → 3초(luna는 짧은 답도 1.2초 안팎이라 기존 값이면 거의 항상 타임아웃; 이제 첫 응답 경로 밖이라 늘려도 체감 지연 없음).
- 직접 Gemini 폴백은 `gemini-flash-lite-latest` 그대로.
- **예외: 네이버 사진 번호 고르기(`selectBestImageIndex`)는 `google/gemini-2.5-flash-lite` 유지.** 같은 질문을 2회씩 6낱말에 물었더니 luna는 3낱말에서 답이 흔들리거나 규칙을 어겼다(무지개 0↔1, 행복 0↔3, 우정 → 금지된 인물 사진). flash-lite는 6/6 일관, 약 0.9초(luna 약 1.2초). `ai.ts`의 `IMAGE_JUDGE_MODEL` 한 줄로 바꿀 수 있다.

## 3. 저렴한 모델 비교 (2026-10-09, Timely 경유, 한국 PC, temperature 0.1)

사진 고르기 = 6낱말 × 2회(허용 답 기준), 쉬운 말 = 3낱말 JSON(개수 일치·명사형 종결·예문에 낱말 포함), 시간은 중앙값.

| 모델 | 사진 고르기 | 시간 | 쉬운 말 | 시간 | 관련어 시간 | 비고 |
|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 12/12 | 0.77초 | 3/3 | 0.99초 | 0.88초 | 가장 빠름. 관련어에 없는 말("불빛벌레")이 섞이나 krdict 검증에서 걸러짐 |
| `openai/gpt-5.6-luna` (effort none) | 12/12 | 1.08초 | 3/3 | 1.56초 | 1.37초 | 쉬운 말이 가장 사전답다("3월 초의 날"). 앞선 시험에서는 6낱말 중 3낱말 흔들림 |
| `anthropic/claude-haiku-4.5` | 12/12 | 1.19초 | 3/3 | 1.62초 | 2.55초 | 품질 좋으나 느리고 단가 높은 축 |
| `openai/gpt-5-mini` (minimal) | 9/12 | 1.19초 | 3/3 | 1.59초 | 1.63초 | 연필 → 캐릭터 쇼핑 사진 선택 |
| `openai/gpt-5-nano` (minimal) | 8/12 | 1.14초 | 3/3 | 1.70초 | 1.38초 | 행복·소나기에 광고·뉴스 선택, 경칩 뜻 엉뚱("날씨의 달력 표시") — 부적합 |
| `google/gemini-3.7-flash` (minimal) | 12/12 | 2.62초 | 3/3 | 3.03초 | 4.24초 | 품질 좋으나 2~4배 느림 |

결론: 사진 고르기는 flash-lite 유지. 쉬운 말·관련어·주제 낱말은 luna(byeduin 기본값)로 두되, 속도를 더 줄여야 하면 flash-lite가 품질 손실 없이 0.5초가량 빠르다(`ai.ts`의 `TIMELY_MODEL` 한 줄).

## 4. 화면 쪽 속도 (2026-10-09 후속)

운영 측정: JS 78KB 1.27초, 헤더 로고 49KB 0.84초, GA 스크립트 약 180KB, 자동완성 글자마다 1.03초. 정적 파일도 파리 엣지에서 오므로(무료 플랜 라우팅) "다시 받지 않기"와 "기다리지 않기"가 핵심이다.

| 항목 | 변경 |
|---|---|
| 자동완성 즉시 표시 | 기기 안 낱말 풀(내 기록·즐겨찾기·내 주제·기본 주제 300여 개)로 바로 띄우고, 서버 결과는 같은 순위 규칙(`rankSuggestions`, 서버와 공용)으로 뒤이어 합친다. 로컬 실측 30ms 이내 |
| 미리 받기 | 낱말 칩·자동완성 항목에 마우스가 80ms 머물거나 누르는 순간(pointerdown) `/api/lookup?prefetch=1`. 동시 3개 상한. 미리 받기는 인기 집계에서 빼고, 실제로 열 때 `POST /api/popular`로 세션당 한 번 센다(사전 캐시에 있는 낱말만) |
| JS·CSS 장기 보관 | `public/_headers`: `/assets/*` 1년 `immutable`(파일 이름에 해시) |
| 헤더 로고 | `logo-64.png` 3.5KB(기존 `logo-192.png` 49KB를 32px로 표시하던 것) |
| GA 지연 로드 | 명령은 바로 `dataLayer`에, 스크립트는 `load` 뒤 `requestIdleCallback`(최대 3초)로. `page_location` 고정. 첫 1~2초 안에 떠나는 방문은 집계에서 빠질 수 있음 |
| 기다리는 화면 | 결과 카드 모양 자리표시(체감) |
| 글꼴 | 기기 기본 글꼴만(맑은 고딕·애플 SD 산돌고딕 Neo·system-ui). 글꼴 파일 내려받기 없음(전에도 없었음) |

## 5. 실행 위치: Smart Placement → 서울 리전 힌트 (2026-10-09)

Git 연동 배포 뒤 15분 동안 가벼운 요청을 계속 보냈지만 `cf-placement`는 `local-DUB/NRT/MIA`에 머물렀다(트래픽이 적어 Smart Placement 분석이 시작되지 않는 것으로 보임). 엣지도 요청마다 더블린·도쿄·마이애미로 바뀌었다.
→ `placement: { region: "aws:ap-northeast-2" }`(AWS 서울 리전과 지연이 가장 짧은 데이터센터에서 실행). 리전 힌트는 트래픽 분석 없이 바로 적용된다. Pages Functions 지원은 문서에 명시돼 있지 않아 배포 후 `cf-placement` 헤더로 확인한다.
