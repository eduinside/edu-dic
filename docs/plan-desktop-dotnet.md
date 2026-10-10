# 데스크탑 앱 C#(.NET) 전환 계획 (2026-10-10)

> 상태: 0.4.2 배포 완료 · 대상: `desktop/` (Tauri v2 0.3.0 → .NET 10 WPF + Blazor Hybrid 0.4.0)

## 1. 목표

- **작고 쉬워서 빠르게 낱말을 찾는 앱** — 기능은 지금 그대로, 화면 디자인도 0.3.0 그대로 옮긴다.
- 업무노트(`LOCAL/local-law`)와 같은 구조: WPF 창 + Blazor 화면 + 단일 exe.
- **자동 업데이트를 소수점(패치) 버전까지**: 릴리스 스크립트가 패치 번호를 올리고 빌드·서명·매니페스트까지 만든다. 설치된 앱은 시작할 때와 6시간마다 스스로 확인해 조용히 바꾼다.
- 웹·서버(Pages Functions, D1, R2)는 바꾸지 않는다 — 무료 티어 그대로.

## 2. 기능 이식표

| Tauri 0.3.0 | .NET 0.4.0 |
|---|---|
| 테두리 없는 투명 창(500×92), 항상 위, 작업표시줄 없음, 화면 가운데 | WPF `WindowStyle=None` + `AllowsTransparency`, `Topmost`, `ShowInTaskbar=false` |
| 창 높이 자동(검색 92 / 추천 최대 580 / 결과 680) | 같은 계산(`WindowSize.For`) → WPF가 높이만 바꿈 |
| 캡슐 검색창, 추천 낱말(↑↓ Enter), 초성만 입력하면 1순위로 바로 | Razor로 같은 마크업·문구, 같은 80ms 지연 |
| 결과 카드: 원문/쉬운말, 동형이의어 탭, 예문 형광펜, 사진, 출처, 다른 뜻, 누리집에서 보기 | 같은 화면. 쉬운말은 `/api/simplify` 비동기 |
| 발음: 국어원 MP3 → 없으면 브라우저 TTS | 같은 방식(웹뷰 `Audio`·`speechSynthesis`) |
| F11 전체화면, ESC 단계별 뒤로(전체화면→결과→추천→숨김) | 같은 동작, 전체화면은 현재 모니터 전체 |
| 창 끌어 옮기기(검색창·결과 상단) | `data-drag` → WebMessage → `WM_NCLBUTTONDOWN` |
| 트레이(버전 표시, 사전 열기, 웹 사전 열기, 종료), 좌클릭으로 열기 | WinForms `NotifyIcon` |
| 전역 단축키 Ctrl+Alt+D(열기/숨기기) | `RegisterHotKey` |
| 단일 실행 | 이름 있는 Mutex + 이벤트 |
| NSIS 설치 + Tauri updater(minisign) | **스스로 설치하는 exe** + 자체 업데이트(SHA-256 + ECDSA P-256 서명) |

추가한 것은 두 가지뿐: 트레이 "Windows 시작 시 실행" 켜고 끄기(기본 꺼짐), 숨겨져 있을 때 웹뷰 메모리 낮춤.

## 3. 배포·업데이트

- 같은 R2 키를 그대로 쓴다: `edu-dic-desktop-setup.exe`(설치 파일 = 앱 exe), `desktop-latest.json`(매니페스트).
- 매니페스트 하나로 **옛 Tauri 앱과 새 앱이 함께** 읽는다. Tauri는 모르는 필드를 무시한다(`tauri-plugin-updater` 2.10 `InnerRemoteRelease`).

```json
{
  "version": "0.4.0",
  "notes": "…",
  "pub_date": "2026-10-10T00:00:00Z",
  "platforms": { "windows-x86_64": { "signature": "<minisign — 옛 Tauri 앱용>", "url": "https://dic.dgedu.link/api/download/desktop" } },
  "sha256": "<exe SHA-256 hex>",
  "ecdsa": "<SHA-256에 대한 ECDSA P-256 서명, base64 — 새 앱용>"
}
```

- **옛 0.3.0 → 새 앱 자동 전환**: Tauri updater는 내려받은 exe를 `/P /R /UPDATE /ARGS`로 실행하고 스스로 끝난다(2.10.1 `install_inner` 확인). 새 exe는 설치 폴더 밖에서 실행되면 설치기로 동작한다:
  1. `%LOCALAPPDATA%\Programs\EduDic\어린이 쉬운 사전.exe`로 자신을 복사
  2. 시작 메뉴·바탕화면 바로가기, 제거 정보(HKCU `Uninstall\EduDicDesktop`)
  3. 옛 Tauri 앱이 있으면 제거 프로그램을 조용히(`/S`) 실행, 옛 시작 프로그램 등록은 새 앱으로 이어 받음
  4. 설치한 앱 실행 → 트레이 풍선으로 "Ctrl+Alt+D로 열어요" 안내
- **새 앱의 업데이트**: 설치 폴더에서 실행 중일 때만. 매니페스트 버전이 더 높으면 내려받아 SHA-256·서명 확인 → 창이 숨겨져 있을 때 `exe → .old`, 새 파일 → exe로 바꾸고 다시 시작. 확인 실패는 조용히 넘어간다.
- 서명 키: ECDSA 개인키는 루트 `.dev.vars`의 `DESKTOP_UPDATER_ECDSA_KEY`(git 무시, 키관리.exe로 백업), 공개키는 코드에. Tauri minisign 키는 `desktop/src-tauri/updater.key`(git 무시) 그대로 — 옛 앱이 남아 있는 동안 계속 함께 서명한다.

## 4. 릴리스 스크립트 `desktop/tools/release.ps1`

1. `Directory.Build.props`의 `<Version>` 패치 번호 +1 (`-Minor`/`-Major`/`-Version x.y.z`로 바꿀 수 있음)
2. 테스트 → `dotnet publish`(단일 exe) → SHA-256·ECDSA 서명(`tools/EduDic.Sign`) → minisign 서명(Tauri CLI, `tools/package.json`에 버전 고정)
3. `release/desktop-latest.json` 작성, `CHANGELOG.md`에 한 줄 추가, 커밋
4. `-Upload`면 R2 두 객체를 올림(`wrangler r2 object put --remote`) — 실제 배포

## 5. 구조

```
desktop/
├─ Directory.Build.props   # <Version> 한 곳
├─ EduDic.slnx
├─ src/EduDic.Core/        # 순수 로직: API 모델·클라이언트, 초성, 형광펜 나누기, 창 높이, 버전·매니페스트·서명 검증
├─ src/EduDic.App/         # WPF 셸(창·트레이·단축키·설치·업데이트) + Blazor 화면
├─ tests/EduDic.Tests/     # xUnit
└─ tools/                  # release.ps1, EduDic.Sign(키 만들기·서명), package.json(Tauri CLI 고정)
```

## 6. 검증

- xUnit: 초성 판별, 형광펜 나누기, 창 높이, 출처 문구, 버전 비교, 매니페스트 파싱, 서명 왕복·변조 거부
- 실행 확인: 투명 캡슐·추천·결과 화면 캡처, 단축키·ESC·F11
- 전환 확인: 로컬에서 설치기 모드 실행(바로가기·제거 정보·옛 앱 제거), 매니페스트를 Tauri 형식으로 읽을 수 있는지

## 7. 변경분만 받는 업데이트 (0.5.0, 2026-10-10 추가 · 구현됨)

0.4.x는 패치마다 80MB exe 전체를 받는다. 0.5.0부터 앱을 **팩 3개로 나눠** 바뀐 팩만 받는다.

| 팩 | 내용 | 바뀌는 때 |
|---|---|---|
| `app` | 우리 코드(`어린이 쉬운 사전.exe/.dll`, `EduDic.*`, 설정 json) | 거의 모든 릴리스 — 수 MB |
| `web` | Blazor·WebView2 라이브러리(`Microsoft.AspNetCore.*`, `Microsoft.Extensions.*`, `Microsoft.Web.WebView2.*` …) | NuGet 버전 올릴 때 |
| `runtime` | .NET·WPF 런타임 | SDK 올릴 때 |

- 팩 = 결정적 zip(이름순, 시각 고정) → 내용이 같으면 해시도 같다. R2 `desktop-packs/<sha256>.zip`, 새 함수 `GET /api/download/pack/<sha256>`(불변·1년 캐시).
- 매니페스트에 `packs:[{name,sha256,size,url}]`, `packsEcdsa`(= `edudic-packs|버전|이름:해시:크기;…` 서명) 추가. 옛 필드(Tauri용 minisign, 0.4.x용 sha256·ecdsa)는 **설치 프로그램**을 가리키게 유지.
- 설치 배치: `%LOCALAPPDATA%\Programs\EduDic\versions\<버전>\`(폴더 게시본) + `app\`(현재 버전을 가리키는 정션 — cmd 없이 Windows API로 만듦). 바로가기·시작 프로그램·제거 정보는 `app\어린이 쉬운 사전.exe`.
- 업데이트: 바뀐 팩만 내려받아 해시 확인 → 새 버전 폴더를 만들고 안 바뀐 팩 파일은 현재 폴더에서 하드 링크(실패하면 복사) → 창이 숨겨져 있을 때 정션을 바꾸고 새 버전으로 다시 시작. 옛 버전 폴더는 다음 실행 때 지움.
- **설치 프로그램** `어린이 쉬운 사전 설치.exe`(.NET Framework 4.8 — Windows 10·11 기본 포함, 약 50KB): 매니페스트 확인·팩 내려받기·정션까지 하고 앱을 `--finish-install`로 띄우면 앱이 바로가기·제거 정보·옛 Tauri 정리를 맡는다. 다운로드 링크·옛 Tauri 업데이터·0.4.x 업데이터가 모두 이 파일을 받는다.
  - 0.4.x: 자기 exe 자리에 설치 프로그램을 넣고 `--wait-pid N --autostart`로 띄움 → 창 없이 설치 → 새 배치로 옮겨지고 옛 exe는 앱이 지움.
- 서버 함수가 먼저 배포돼야 매니페스트를 올린다(안 그러면 팩을 못 받음) — release.ps1이 팩 주소를 확인한 뒤 올림.
- 시험용 `EDUDIC_UPDATE_URL`(매니페스트 주소 바꾸기)로 로컬 서버에서 설치·변경분 업데이트를 먼저 확인.
