# 어린이 쉬운 사전 데스크탑

작고 쉬워서 빠르게 낱말을 찾는 Windows 스팟라이트 사전. `Ctrl+Alt+D`로 어디서든 열고, ESC로 닫는다.
C# .NET 10 · WPF + Blazor Hybrid (0.3.0까지는 Tauri). 설계: [../docs/plan-desktop-dotnet.md](../docs/plan-desktop-dotnet.md) · 설치·업데이트(0.6.0~): [../docs/plan-desktop-kit.md](../docs/plan-desktop-kit.md)

## 구성

| 프로젝트 | 내용 |
|---|---|
| `src/EduDic.Core` | 사전 API·화면 규칙, **`AppKit.cs`**(설치·업데이트 값 — 공용 모듈 DesktopKit), `LegacyLayout.cs`(다리 판만) |
| `src/EduDic.App` | 앱(WPF 창·트레이·단축키·KitUpdater + Blazor 화면), `LegacyMigration.cs`(다리 판만), `terms.txt`(이용 안내) — 폴더 게시 |
| `tools/release.ps1` · `tools/packs.json` | 릴리스 (kit 설치 파일·팩·서명) |
| `tools/EduDic.Sign` | 다리 판만: 옛 매니페스트 `desktop-latest.json` 만들기 |
| `tests/EduDic.Tests` | xUnit |
| (`LOCAL/local-desktop-kit`) | 설치 파일(`DesktopKit.Setup`)·팩·서명·정션·`KitUpdater` — ProjectReference |

## 명령

- 빌드: `D:\Setup\DevTools\dotnet\dotnet.exe build EduDic.slnx`
- 시험: `D:\Setup\DevTools\dotnet\dotnet.exe test tests\EduDic.Tests`
- 실행(개발): `src\EduDic.App\bin\Debug\...\어린이 쉬운 사전.exe` — 설치판이 아니라 자동 업데이트는 꺼진다
  - `EDUDIC_DATA_DIR` 화면 엔진·설정 폴더 · `EDUDIC_CDP_PORT` 화면 원격 디버깅 · `EDU_DIC_UPDATE_URL` 매니페스트 주소 · `EDU_DIC_INSTALL_DIR` 설치 폴더(시험)
- 릴리스: `powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점|둘째 줄" [-Minor] [-Bridge] [-Upload]`
  - 패치 번호 +1 → 시험 → 앱 폴더 게시 → kit 설치 파일 → 팩(app·web·runtime)·`latest.json`·서명 → CHANGELOG → 커밋
  - `-Upload`: R2 `byeduin-media/apps/edu-dic/` 에 팩 → 설치 파일 → `latest.json`(마지막). 설치된 앱은 6시간 안에 **바뀐 팩만** 받는다
  - `-Bridge`(0.6.0 다리 판만): 옛 저장소(`edu-dic-downloads`)용 `desktop-latest.json` 도 — 0.5.0·0.4.x·Tauri 가 넘어오는 길
  - 로컬 시험: `-BaseUrl http://127.0.0.1:<포트>/ -Out <폴더> -NoCommit` → `upload` 를 로컬 서버로 열고 `EDU_DIC_INSTALL_DIR` 로 설치·업데이트

## 설치·업데이트 동작 (공용 모듈 DesktopKit — kit docs/spec.md)

- 설치 배치: `%LOCALAPPDATA%\Programs\EduDic\versions\<판>\` + `app\`(지금 판을 가리키는 정션) + `install.json` + `EduDic-Setup.exe`(설치 파일 사본 — 제거·다시 설치). 바로가기·시작 프로그램은 `app\어린이 쉬운 사전.exe`. 데이터(화면 엔진·설정) `%LOCALAPPDATA%\EduDic`.
- 설치 파일: dic.dgedu.link 단추 → `https://eduin.info/downloads/apps/edu-dic/setup`. 기록은 `%TEMP%\edu-dic-setup.log`.
- 자동 업데이트: 시작 1분 뒤·6시간마다 → 바뀐 팩만 받아 새 판 폴더(안 바뀐 파일은 하드 링크) → 정션을 바꿔 두고, 창이 숨겨져 있을 때 `--autostart` 로 다시 시작. 앞 판 하나는 남긴다.
- 사용 통계: 업데이트 확인 때 익명 설치 번호(`X-Kit-Install`)만. 트레이 › ‘사용 통계 보내기’로 끈다. 안내는 트레이 › ‘이용 안내’(`terms.txt`).
- 제거: ‘앱 및 기능’(설치 파일 사본 `--uninstall`). 데이터 폴더는 남긴다.

## 규칙

- 화면은 0.3.0 디자인 그대로 — 색·크기는 `wwwroot/css/app.css` 맨 위 토큰(옛 Tailwind @theme)만 쓴다.
- **서명 키는 커밋 금지**(공개 저장소): 루트 `.dev.vars`의 `DESKTOP_UPDATER_ECDSA_KEY`(0.4.0~ 같은 키 — 바꾸면 설치된 앱이 업데이트를 못 받는다), 옛 Tauri 키 `src-tauri/updater.key`(다리 판의 minisign 용). 둘 다 키관리.exe로 백업.
- 이용 안내(`terms.txt`)와 사이트 활용 안내의 ‘PC 앱 이용 안내’는 함께 고친다 — 보내는 것이 바뀌면 안내를 먼저.
- 다리 판 코드(`LegacyMigration`·`LegacyLayout`·`EduDic.Sign`·`-Bridge`)는 0.6.1·0.6.2 뒤 옛 저장소를 비울 때 지운다.
