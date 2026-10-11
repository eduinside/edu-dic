# 데스크탑 앱을 DesktopKit 으로 옮기기 — 0.6.0 ‘다리 판’ (2026-10-11)

plan-desktop-dotnet.md §8 의 실행 계획. 붙이는 법은 `LOCAL/local-desktop-kit/docs/integrate.md`, 형식은 같은 저장소 `docs/spec.md`(kit 1).

## 1. 정한 값

| 값 | 0.6.0~ | 0.5.0 까지 |
|---|---|---|
| Id | `edu-dic` (환경 변수 앞머리 `EDU_DIC_` — kit 가 `-` 를 `_` 로) | — (`EDUDIC_UPDATE_URL`) |
| Name (바로가기·제거 목록) | `어린이 쉬운 사전 데스크탑` — 그대로 (바로가기·시작 프로그램 값 이름이 같아 이어짐) | 같음 |
| ExeName | `어린이 쉬운 사전.exe` | 같음 |
| 설치 폴더 | `%LOCALAPPDATA%\Programs\EduDic` `versions\<판>` + `app` 정션 | 같음 → **옮길 파일 없음** |
| 매니페스트 | `https://eduin.info/downloads/apps/edu-dic/latest.json` (R2 `byeduin-media` `apps/edu-dic/`) | `dic.dgedu.link/api/download/desktop-latest.json` (R2 `edu-dic-downloads`) |
| 설치 파일 | kit `DesktopKit.Setup` → `EduDic-<판>-Setup.exe`, 사본 `EduDic-Setup.exe`, 고정 주소 `…/apps/edu-dic/setup` | `EduDic.Setup` (`어린이 쉬운 사전 설치.exe`) |
| 제거 정보 | `HKCU\…\Uninstall\edu-dic` → 설치 파일 사본 `--uninstall` | `…\Uninstall\EduDicDesktop` → 앱 `--uninstall` |
| 서명 키 | **그대로** 루트 `.dev.vars` `DESKTOP_UPDATER_ECDSA_KEY` (공개키 `MFkwEw…O1w==` 그대로) | 같음 |
| 업데이트 확인 | 시작 1분 뒤 + 6시간마다 (KitUpdater), 받으면 **창이 숨겨져 있을 때** 새 판으로 다시 시작 (`--autostart`) — 지금 동작 유지 | 20초 뒤 + 6시간 |
| 데이터 | `%LOCALAPPDATA%\EduDic` (화면 엔진·설정) — 설치 폴더 밖, 제거해도 남김 | 같음(제거 때 지움) |

## 2. 다리 판 0.6.0 — 누가 어떻게 넘어오나

0.6.0 은 **새 저장소와 옛 저장소에 함께** 올린다. 팩 zip 은 같은 파일(내용 주소)이고 이름만 다르다.

| 지금 설치 | 받는 곳 | 받는 것 | 0.6.0 앱이 처음 켜질 때 (`LegacyMigration`) |
|---|---|---|---|
| 0.5.0 | 옛 `desktop-latest.json` 의 `packs`(+`packsEcdsa`) | 바뀐 팩만 → `versions\0.6.0` → 정션 → `--wait-pid --autostart` 로 다시 시작 | `install.json` 이 없으면 만든다(익명 설치 번호 포함) → 앱 팩에 실린 설치 파일을 `EduDic-Setup.exe` 로 복사 → 제거 정보 `EduDicDesktop` 를 지우고 `edu-dic` 로 |
| 0.4.x | 옛 매니페스트의 `sha256`·`ecdsa` (설치 파일) | **kit 설치 파일**을 자기 exe 자리에 놓고 `--wait-pid N --autostart` 로 실행 → kit 설치 | 옛 단일 exe(`Programs\EduDic\어린이 쉬운 사전.exe`, 사실은 방금 돈 설치 파일) 지우기 |
| Tauri 0.3.0 이하 | 옛 매니페스트의 `platforms`(minisign) | **kit 설치 파일**을 `/P /R /UPDATE /ARGS` 로 실행(모르는 인수는 무시) → kit 설치 | 옛 Tauri 앱을 제거 프로그램(`/S`)으로 지우고 바로가기·시작 프로그램을 새 경로로 다시 |
| 새로 설치 | dic.dgedu.link 단추 → `eduin.info/downloads/apps/edu-dic/setup` | kit 설치 파일 | 할 일 없음 |

- 0.6.0 부터 앱은 kit `KitUpdater` 로 **새 주소만** 본다. 옛 매니페스트는 0.6.0 에 머문다.
- 옛 버킷·매니페스트·`functions/api/download/*` 는 **두 판(0.6.1·0.6.2) 동안** 그대로 두어 늦게 켜는 PC 도 다리를 건너게 한 뒤 비운다. 그때 `LegacyMigration`·앱 팩의 설치 파일 사본·`tools/EduDic.Sign`·`-Bridge` 도 지운다.
- 옛 `/api/download/desktop` 도 0.6.0 설치 파일(kit)을 내준다 — 옛 링크로 받아도 새 방식으로 깔린다.

## 3. kit 에 더할 것 (DesktopKit 0.3.0 — 모두 덧붙임, G노트 동작은 그대로)

1. **환경 변수 앞머리**: `Id` 의 `-` 를 `_` 로 (`EDU_DIC_UPDATE_URL`·`EDU_DIC_INSTALL_DIR`). `gnote` 는 그대로.
2. **설치 파일이 자기를 닫지 않게**: `CloseRunning` 에서 자기 프로세스는 뺀다 (0.4.x 는 설치 파일을 앱 exe 이름으로 설치 폴더 안에서 띄운다).
3. **트레이 앱 닫기**: 빌드 속성 `KitQuitEvent`(이름 있는 이벤트, 예 `Local\EduDicDesktop-Quit`) — 있으면 창 닫기 요청 전에 이 이벤트를 켠다. 숨은 창은 `CloseMainWindow` 로 닫히지 않는다.
4. **`RestartNow(shutdown, args)`**: 새 판을 띄울 때 더할 인수 (사전은 `--autostart` — 창 없이 트레이로).

## 4. 앱 코드

- `EduDic.Core/Install.cs`·`Update.cs` **지움** (kit 의 원형 — `KitLayout`·`KitPacks`·`KitSign`·`KitManifest` 로). `EduDic.Setup` 프로젝트 **지움** (kit 설치 파일로).
- `EduDic.App/AppKit.cs`: `KitApp` 값 + 설치판 여부.
- `App.xaml.cs`: `--wait-pid` 를 단일 실행 확인보다 먼저(지금과 같음) → `LegacyMigration.Adopt()`(동기, 파일·레지스트리만) → `KitUpdater(…, 6시간, () => true, () => settings.UsageStats)` → 받아 두면(`Ready`) 창이 숨겨져 있을 때 `RestartNow(Quit, "--autostart")`. `--uninstall` 은 설치 파일 사본에 넘긴다(옛 제거 정보로 지우는 경우). `--finish-install`·`Installer.cs`·`Updater.cs` 지움.
- `LegacyMigration.cs` (다리 기간만): 위 §2 표의 오른쪽 칸. 옛 Tauri 제거는 시간이 걸려 뒤에서.
- `Settings.cs`: `%LOCALAPPDATA%\EduDic\settings.json` — `usageStats`(기본 켬).
- 트레이 메뉴: **‘사용 통계 보내기’**(체크, 한 번 눌러 끄기) · **‘이용 안내’**(앱 안 글 — `terms.txt`, 초등 눈높이).
- 알 수 없는 KitUpdater 오류는 지금처럼 조용히.

## 5. 사용 통계 (kit 0.2 §6.1)

이용 안내를 먼저 쓴다 — `desktop/src/EduDic.App/terms.txt`(앱 안, 정본)와 dic.dgedu.link 활용 안내의 PC 앱 칸(요약).

- 무엇을: 설치할 때 만든 **무작위 번호**(이름·학교·PC·계정과 무관)와 **판**.
- 왜: 몇 명이 쓰는지 세려고.
- 얼마나: 서버는 번호를 **바꾼 값(해시)**·날짜·판만 하루 한 줄. 90일 뒤에는 날짜별 사용자 수만 남기고 지움. IP·번호 원문 저장 안 함.
- 끄는 법: 트레이 아이콘 오른쪽 클릭 › ‘사용 통계 보내기’ 체크 끄기 (업데이트 확인은 그대로).
- 서버: byeduin-labs `functions/downloads/apps/[[path]].js` `DESKTOP_APPS` 에 `edu-dic` (통계 커밋 `eabe8e8` 위에).

## 6. 릴리스 (`desktop/tools/release.ps1` 다시 씀 — G노트 것을 본보기로)

1. 판 올리기(지금처럼 `Directory.Build.props`, `-Minor` 등) → 시험 → 앱 폴더 게시
2. kit 설치 파일 빌드(`-p:KitId=edu-dic … -p:KitQuitEvent=Local\EduDicDesktop-Quit -p:KitNeedsWebView2=true`) → **다리 기간엔 게시 폴더에 `EduDic-Setup.exe` 로도 넣는다**(0.5.0 이 팩으로 넘어올 때 쓸 사본)
3. kit 릴리스 도구 `build` → `release\upload\`: `pack-<sha>.zip` · `EduDic-<판>-Setup.exe` · `latest.json`
4. `-Bridge`: `tools/EduDic.Sign legacy` 로 옛 형식 `release\legacy\desktop-latest.json`(팩 주소 `dic.dgedu.link/api/download/pack/<sha>`, `packsEcdsa`, 설치 파일 `sha256`·`ecdsa`, Tauri minisign)
5. CHANGELOG·커밋
6. `-Upload`(확인받은 뒤): 새 저장소 팩 → 설치 파일 → `latest.json`, `-Bridge` 면 이어서 옛 저장소 팩 → 설치 파일 → `desktop-latest.json`(마지막)
- 시험: `-BaseUrl http://127.0.0.1:<포트>/ -Out <폴더> -NoCommit`

## 7. 확인

- `dotnet test` (사전 시험 + kit 시험), G노트 빌드(kit 바뀐 API)
- 로컬 실측 (`release\` 를 127.0.0.1 서버로, `EDU_DIC_UPDATE_URL`·`EDU_DIC_INSTALL_DIR` 를 시험 폴더로):
  1. kit 설치 파일로 설치 → 앱 실행·`install.json`
  2. 판을 올려 다시 만들기 → 앱이 **app 팩만** 받는지 → 창 숨김 때 다시 시작(새 판)
  3. 다리: 0.5.0 꼴 배치(`install.json` 없음, `packs.txt` 있음)에서 0.6.0 을 띄워 받아들이기(adopt) → 업데이트
  4. 옛 0.5.0 코드(커밋 `06f619d`)로 만든 `desktop-latest.json` 을 읽고 서명 확인되는지
  5. 제거(설치 파일 사본 `--uninstall`) → 폴더·바로가기·제거 정보가 지워지는지
- 이 PC 엔 실제 0.5.0 이 깔려 있다 → 시험 전에 제거 정보(`EduDicDesktop`)·시작 프로그램 값·바로가기를 백업하고 끝나면 되돌린다.
- R2 올리기·dic.dgedu.link 배포·푸시·원격 D1 은 확인받은 뒤.

## 8. 결과 (2026-10-12)

코드·로컬 실측 끝 — 무엇을 어떻게 확인했는지는 [STATUS.md](STATUS.md) 2026-10-12. R2 올리기(`-Minor -Bridge -Upload`)와 사이트 단추 바꾸기는 확인받은 뒤.
