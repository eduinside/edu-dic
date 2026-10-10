# 어린이 쉬운 사전 데스크탑

작고 쉬워서 빠르게 낱말을 찾는 Windows 스팟라이트 사전. `Ctrl+Alt+D`로 어디서든 열고, ESC로 닫는다.
C# .NET 10 · WPF + Blazor Hybrid · 단일 exe (0.3.0까지는 Tauri). 설계: [../docs/plan-desktop-dotnet.md](../docs/plan-desktop-dotnet.md)

## 명령

- 빌드: `D:\Setup\DevTools\dotnet\dotnet.exe build EduDic.slnx`
- 시험: `D:\Setup\DevTools\dotnet\dotnet.exe test tests\EduDic.Tests`
- 실행(개발): `src\EduDic.App\bin\Debug\...\어린이 쉬운 사전.exe` — Debug 판은 설치기로 동작하지 않는다
  - `EDUDIC_DATA_DIR` 화면 엔진 폴더 바꾸기 · `EDUDIC_CDP_PORT` 화면 원격 디버깅(자동 시험) · `EDUDIC_NO_INSTALL` 배포판을 설치 없이 실행
- 릴리스: `powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점" [-Upload]`
  - 패치 번호 +1 (`-Minor` · `-Major` · `-Version x.y.z`) → 시험 → 게시 → ECDSA·minisign 서명 → `release\desktop-latest.json` → CHANGELOG → 커밋
  - `-Upload`면 R2(`edu-dic-downloads`)에 exe·매니페스트를 올린다 = 실제 배포. 설치된 앱은 6시간 안에 저절로 바뀐다.

## 규칙

- 화면은 0.3.0 디자인 그대로 — 색·크기는 `wwwroot/css/app.css` 맨 위 토큰(옛 Tailwind @theme)만 쓴다.
- 서버(`functions/api/download/*`)는 바꾸지 않는다. 매니페스트 하나를 옛 Tauri 앱과 새 앱이 함께 읽는다.
- **서명 키는 커밋 금지**(공개 저장소): 새 앱 키는 루트 `.dev.vars`의 `DESKTOP_UPDATER_ECDSA_KEY`, 옛 Tauri 키는 `src-tauri/updater.key`(빈 비밀번호). 둘 다 키관리.exe로 백업 — 잃으면 설치된 앱이 더 이상 업데이트를 못 받는다.
- 키를 바꾸면 `src/EduDic.Core/Update.cs`의 `PublicKey`도 바꿔야 하고(`tools/EduDic.Sign pubkey`), 이미 설치된 앱은 수동 재설치가 필요하다.

## 설치·업데이트 동작

- 설치 폴더 `%LOCALAPPDATA%\Programs\EduDic\어린이 쉬운 사전.exe`, 화면 엔진 `%LOCALAPPDATA%\EduDic`, 제거 정보 HKCU `Uninstall\EduDicDesktop`.
- 설치 폴더 밖에서 실행하면 설치기: 복사 → 바로가기(시작 메뉴·바탕화면) → 옛 Tauri 앱 조용히 제거(시작 프로그램 등록은 이어 받음) → 실행.
- 자동 업데이트: 시작 20초 뒤·6시간마다 확인 → 내려받아 SHA-256·서명 확인 → 창이 숨겨져 있을 때 `exe → .old` 교체 후 다시 시작.
- 제거: ‘앱 및 기능’ 또는 `"어린이 쉬운 사전.exe" --uninstall`.
