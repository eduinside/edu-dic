# 어린이 쉬운 사전 데스크탑

작고 쉬워서 빠르게 낱말을 찾는 Windows 스팟라이트 사전. `Ctrl+Alt+D`로 어디서든 열고, ESC로 닫는다.
C# .NET 10 · WPF + Blazor Hybrid (0.3.0까지는 Tauri). 설계: [../docs/plan-desktop-dotnet.md](../docs/plan-desktop-dotnet.md)

## 구성

| 프로젝트 | 내용 |
|---|---|
| `src/EduDic.Core` | 사전 API·화면 규칙·매니페스트, **`Install.cs`**(설치 배치·팩 설치·서명 확인·정션 — 설치 프로그램과 함께 씀) |
| `src/EduDic.App` | 앱(WPF 창·트레이·단축키·자동 업데이트·설치 마무리/제거 + Blazor 화면) — 폴더 게시 |
| `src/EduDic.Setup` | **설치 프로그램**(.NET Framework 4.8, 약 130KB) — 다운로드 링크·옛 앱 업데이터가 받는 파일 |
| `tools/EduDic.Sign` | 서명 키 만들기·팩 만들기·서명 |
| `tests/EduDic.Tests` | xUnit |

## 명령

- 빌드: `D:\Setup\DevTools\dotnet\dotnet.exe build EduDic.slnx`
- 시험: `D:\Setup\DevTools\dotnet\dotnet.exe test tests\EduDic.Tests`
- 실행(개발): `src\EduDic.App\bin\Debug\...\어린이 쉬운 사전.exe` — 설치 폴더 밖이라 자동 업데이트는 꺼진다
  - `EDUDIC_DATA_DIR` 화면 엔진 폴더 · `EDUDIC_CDP_PORT` 화면 원격 디버깅 · `EDUDIC_UPDATE_URL` 매니페스트 주소(로컬 시험 서버)
- 릴리스: `powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점" [-Upload]`
  - 패치 번호 +1 (`-Minor` · `-Major` · `-Version x.y.z`) → 시험 → 앱 폴더 게시·설치 프로그램 → 팩(app·web·runtime) → 서명 → `release\desktop-latest.json` → CHANGELOG → 커밋
  - `-Upload`: 팩 서버 함수가 살아 있는지 확인 → 새 팩만 올림 → 설치 프로그램 → 매니페스트(마지막). 설치된 앱은 6시간 안에 **바뀐 팩만** 받아 저절로 바뀐다
  - 로컬 시험: `-Out <폴더> -PackBase http://127.0.0.1:포트/packs/ -NoCommit` 로 만들고 `EDUDIC_UPDATE_URL` 로 설치·업데이트를 먼저 확인

## 설치·업데이트 동작

- 설치 배치: `%LOCALAPPDATA%\Programs\EduDic\versions\<버전>\` + `app\`(현재 버전을 가리키는 정션). 바로가기·시작 프로그램·제거 정보는 `app\어린이 쉬운 사전.exe`. 화면 엔진 데이터 `%LOCALAPPDATA%\EduDic`.
- 설치 프로그램: 매니페스트 서명 확인 → 필요한 팩만 내려받아 해시 확인 → 버전 폴더 → 정션 → 앱을 `--finish-install`로 실행(바로가기·제거 정보·옛 Tauri 앱 제거·시작 프로그램 이어 받기). 기록은 `%TEMP%\EduDicSetup.log`.
- 팩: `app`(우리 코드, 약 0.6MB) · `web`(Blazor·WebView2, 약 1.2MB) · `runtime`(.NET·WPF, 약 76MB). 결정적 zip이라 내용이 같으면 해시도 같아 다시 받지 않는다. R2 `desktop-packs/<sha256>.zip` → `GET /api/download/pack/<sha256>`.
- 자동 업데이트: 시작 20초 뒤·6시간마다 → 바뀐 팩만 받아 새 버전 폴더(안 바뀐 파일은 하드 링크) → 창이 숨겨져 있을 때 정션을 바꾸고 다시 시작 → 다음 실행 때 옛 버전 폴더 정리.
- 옛 앱: Tauri 0.3.0·.NET 0.4.x 둘 다 같은 매니페스트에서 **설치 프로그램**을 받아 새 배치로 옮겨 온다.
- 제거: ‘앱 및 기능’ 또는 `"app\어린이 쉬운 사전.exe" --uninstall`.

## 규칙

- 화면은 0.3.0 디자인 그대로 — 색·크기는 `wwwroot/css/app.css` 맨 위 토큰(옛 Tailwind @theme)만 쓴다.
- `Install.cs`는 .NET Framework 4.8에서도 컴파일된다 — 그쪽에 없는 API(ImportSubjectPublicKeyInfo, 범위 연산자, records 등)를 쓰지 않는다.
- **서명 키는 커밋 금지**(공개 저장소): 새 앱 키는 루트 `.dev.vars`의 `DESKTOP_UPDATER_ECDSA_KEY`, 옛 Tauri 키는 `src-tauri/updater.key`(빈 비밀번호). 둘 다 키관리.exe로 백업 — 잃으면 설치된 앱이 더 이상 업데이트를 못 받는다.
- 키를 바꾸면 `src/EduDic.Core/Install.cs`의 `PublicKey`도 바꿔야 하고(`tools/EduDic.Sign pubkey`), 이미 설치된 앱은 수동 재설치가 필요하다.
