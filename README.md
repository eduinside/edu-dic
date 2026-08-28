# 어린이 쉬운 사전 (Edu-Dic)

유치원~초등학생이 어려운 낱말을 입력하면 **쉬운 뜻풀이 + 사진/삽화 + 발음 소리**를 큰 화면으로 보여주는 교육용 사전 웹 & 데스크탑 스팟라이트 앱입니다. 교실 TV/전자칠판 투사 및 자기주도 낱말 학습에 최적화되어 있습니다.

- **웹 서비스 정본 주소**: [https://dic.dgedu.link](https://dic.dgedu.link)
- **데스크탑 앱 다운로드 (Windows)**: [https://dic.dgedu.link/api/download/desktop](https://dic.dgedu.link/api/download/desktop)
- **기술 스택**: Vite + React 19 + Tailwind CSS + Cloudflare Pages/Functions + D1(`edu-link-db`) + Tauri v2(Rust)

---

## 🌟 주요 특징

### 1. 📖 초등 맞춤 3단계 데이터 파이프라인 & 쉬운말 변환
- **신뢰할 수 있는 다중 출처 연계**:
  1. **텍스트**: 국립국어원 한국어기초사전(`krdict`) → 미수록 시 한국민족문화대백과사전(`encykorea`) 대체
  2. **이미지**: 국립국어원 검수 삽화 → 대백과사전 삽화 → 네이버 이미지 검색(정제 필터링) 순차 폴백
  3. **소리(발음)**: 국립국어원 공식 발음 MP3 + 미제공 단어 한국어 TTS(Web Speech API) 자동 지원
- **사전 원문 ↔ 쉬운 말 토글**: AI가 사전 뜻풀이를 뼈대로 삼아 초등 저학년 눈높이의 간결한 명사형 종결 문장 및 일상 예문으로 재설명(조사를 제외한 해당 낱말만 형광펜 하이라이트).

### 2. 🔗 동형이의어 `#` 해시 바로가기 & 소리 재생
- **동음이의어 독립 지원**: "배¹(신체)", "배²(선박)", "배³(과일)" 등 뜻별로 독립된 삽화, 발음, 쉬운말 변환 제공.
- **URL 해시 연동**: `https://dic.dgedu.link/우수#3` 처럼 `#1`, `#2`, `#3` 해시로 특정 동음이의어 뜻풀이에 다이렉트 접근 및 링크 공유 가능.
- **원클릭 발음 듣기**: 표제어 옆 스피커 버튼을 눌러 정확한 한국어 발음 청취 가능.

### 3. 💡 커스텀 낱말 주제 생성 & `dgedu.link` 원클릭 단축 공유
- **네이버 웹문서 연계 AI 어휘 수집**: '24절기', '전통 악기', '과학 실험' 등 원하는 주제를 입력하면 웹문서 스니펫을 분석하여 구체적 어휘 목록을 자동 구성.
- **krdict 사전 접지(Grounding) 검증**: AI가 생성한 후보 단어가 국어원 사전에 실제 존재하는지 1:1 교차 검증하여 환각 단어 차단.
- **dgedu.link 단축 주소 공유**: 생성된 커스텀 주제를 `https://dgedu.link/xxxx` 단축 링크로 학급 학생/동료 교사에게 원클릭 공유 (`[공유 받음]` / `[직접 만듦]` 뱃지 구분).

### 4. 🌐 커스텀 주제 역탐색 & 맥락 기반 연관 낱말 추천
- 다른 사용자가 공유한 커스텀 낱말사전 풀을 실시간 탐색하여, 검색한 낱말이 속한 주제의 형제 단어(`[주제명] 낱말 더 보기`)를 자동 추천.
- 소속 주제 맥락을 주입받은 AI가 단어와 가장 밀접한 초등 추천 어휘(`함께 알면 좋은 낱말 ✨`)를 자연스럽게 제안.


### 5. ⚡ 초성 검색 & 실시간 스마트 자동완성
- 한글 자모 유니코드 분해 공식 기반 초성 검색(`ㄱㅇ` → `고양이`, `가을` 등) 지원.
- 오타나 미등록 초성 입력 시 AI가 가장 유력한 표준 표제어를 추측하여 연결(*"혹시 '고구마'를 찾으셨나요?"*).
- 검색 의도에 맞춘 최적화된 10개 추천어 드롭다운 제공.

### 6. 🖥️ '어린이 쉬운 사전 데스크탑' (Windows PC 앱)
- **전역 단축키(`Ctrl+Alt+D`)**: 수업 중 언제 어디서든 슬림한 캡슐 스팟라이트 창 호출.
- **전체화면(F11) 모드**: 버튼 클릭 또는 `F11` 키로 모니터 화면 전체를 100% 가득 채우는 깨끗한 화이트보드 대형 사전 모드 전환.
- **시스템 트레이 상주**: 트레이 아이콘 우클릭 메뉴에서 현재 버전 확인 및 누리집 바로가기 지원.
- **무중단 자동 업데이트**: Minisign 암호화 디지털 서명과 Cloudflare R2(`edu-dic-downloads`)를 통한 안전하고 신속한 자동 업데이트.

---

## 🛠️ 개발 및 실행 방법

### 웹 (Cloudflare Pages & Vite)

```bash
# 의존성 설치
npm install

# 프런트엔드 로컬 개발 서버 실행
npm run dev

# Pages Functions 포함 로컬 개발 (Wrangler)
npm run pages:dev

# 프로덕션 빌드 및 배포
npm run deploy
```

### 데스크탑 앱 (Tauri v2)

```bash
# 데스크탑 프런트엔드 의존성 설치
cd desktop
npm install

# 데스크탑 개발 모드 실행
npm run tauri dev

# 데스크탑 설치 프로그램(NSIS) 빌드 및 디지털 서명
# updater.key는 빈 비밀번호로 암호화되어 있음 - PASSWORD 변수를 반드시 빈 문자열로 설정해야
# 함(안 하면 makensis 단계에서 비대화형 세션이 비밀번호 프롬프트 대기 상태로 멈춤).
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "src-tauri\updater.key" -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npx tauri build
```

---

## 🔐 환경 변수 (Secrets)

| 변수명 | 필수 여부 | 설명 |
|---|---|---|
| `KRDICT_API_KEY` | 필수 | 국립국어원 한국어기초사전 오픈 API 인증키 |
| `ENCYKOREA_API_KEY` | 선택 | 한국민족문화대백과사전 오픈 API 키 |
| `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` | 선택 | 네이버 검색(웹문서 어휘 수집 및 이미지 폴백) NCP API 키 |
| `TIMELY_API_KEY` | 선택 | Timely AI 게이트웨이 키 (쉬운말 변환, 오타 추측, 관련어 생성) |
| `GEMINI_API_KEY` | 선택 | Google Gemini API 직접 폴백 키 (`gemini-flash-lite-latest`) |
| `DGEDU_LINK_API_KEY` / `EDULINK_API_KEY` | 선택 | `dgedu.link` 단축 URL 생성 API 키 (공유용) |

---

## 📁 프로젝트 구조

```text
edu-dic/
├── app/                  # 웹 프런트엔드 (React 19 + Tailwind v4)
│   ├── components/       # SearchBox, ResultCard, UsageGuide, WordChips 등
│   ├── lib/              # api.ts, storage.ts, words.ts 등
│   └── App.tsx           # 메인 라우팅, 동형이의어 해시, 공유 링크 파서
├── functions/            # Cloudflare Pages Functions (API 백엔드)
│   ├── api/              # lookup, suggest, related, simplify, share-topic, topic-words 등
│   ├── lib/              # krdict, encykorea, naver, ai, choseong, dictionary 등
│   └── _middleware.ts    # 전역 CORS 및 보안 헤더 처리
├── desktop/              # Tauri v2 Windows 데스크탑 앱
│   ├── src/              # 스팟라이트 UI, 전체화면 화이트보드 모드, 발음 재생
│   └── src-tauri/        # Rust 백엔드, 전역 단축키(Ctrl+Alt+D), 트레이, 업데이터
└── docs/                 # PLAN.md, STATUS.md
```
