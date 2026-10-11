# 어린이 쉬운 사전 데스크탑 릴리스 (0.6.0~ 공용 모듈 LOCAL/local-desktop-kit — docs/plan-desktop-kit.md, kit docs/spec.md·integrate.md)
# 사용: powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점|둘째 줄" [-Minor|-Major|-Version x.y.z] [-Bridge] [-Upload] [-NoCommit]
#   기본은 패치 번호 +1 (Directory.Build.props). 만드는 것(release\):
#     app\      게시 폴더 (.NET 포함, 단일 파일 아님)
#     upload\   새 저장소(R2 byeduin-media apps/edu-dic/)에 올릴 것 — pack-<sha>.zip · EduDic-<판>-Setup.exe · latest.json(서명)
#     legacy\   -Bridge 일 때만: 옛 저장소(R2 edu-dic-downloads)용 desktop-latest.json (0.5.0·0.4.x·Tauri 가 읽는 형식, 같은 팩·설치 파일)
#   -Bridge: 다리 판(0.6.0). 앱 팩에 설치 파일 사본을 싣고(0.5.0 이 팩으로 넘어올 때 쓴다) 옛 매니페스트도 만든다.
#            옛 저장소는 다리 판에 머문다 — 다음 판부터는 -Bridge 없이.
#   시험: -BaseUrl http://127.0.0.1:<포트>/ -Out <폴더> -NoCommit → upload 를 로컬 서버로 열고 설치 파일 실행
#         (앱 업데이트 확인은 EDU_DIC_UPDATE_URL, 설치 위치는 EDU_DIC_INSTALL_DIR 로 바꿀 수 있다)
#   -Upload: 새 저장소에 팩 → 설치 파일 → latest.json, -Bridge 면 이어서 옛 저장소에 팩 → 설치 파일 → desktop-latest.json (각각 매니페스트가 마지막).
#            사람이 결과를 확인한 뒤에만. byeduin-labs 서빙 함수 DESKTOP_APPS 에 edu-dic 이 배포돼 있어야 한다.
param(
    [string]$Notes = '',
    [switch]$Minor,
    [switch]$Major,
    [string]$Version,
    [string]$BaseUrl = 'https://eduin.info/downloads/apps/edu-dic/',
    [string]$Out,
    [switch]$Bridge,
    [switch]$Upload,
    [switch]$NoCommit,
    [switch]$NoTest
)
$ErrorActionPreference = 'Stop'
$desk = Split-Path -Parent $PSScriptRoot          # desktop\
$repo = Split-Path -Parent $desk                  # dgedu-dic\
$proj = Split-Path -Parent (Split-Path -Parent $repo) # D:\Proj
$kit = Join-Path $proj 'LOCAL\local-desktop-kit'
$site = Join-Path $proj 'EDUIN-INFO\byeduin-labs'
$dotnet = 'D:\Setup\DevTools\dotnet\dotnet.exe'
if (-not (Test-Path $dotnet)) { $dotnet = 'dotnet' }
$git = 'D:\Setup\DevTools\Git\bin\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }
$props = Join-Path $desk 'Directory.Build.props'
$devVars = Join-Path $repo '.dev.vars'
$tauriKey = Join-Path $desk 'src-tauri\updater.key'
if (-not $Out) { $Out = Join-Path $desk 'release' }
if (-not $BaseUrl.EndsWith('/')) { $BaseUrl += '/' }
$prodBase = 'https://eduin.info/downloads/apps/edu-dic/'
$legacyPackBase = 'https://dic.dgedu.link/api/download/pack/'
$legacySetupUrl = 'https://dic.dgedu.link/api/download/desktop'
$utf8 = New-Object System.Text.UTF8Encoding $false
if ($Upload -and $BaseUrl -ne $prodBase) { throw '-Upload 는 운영 주소(-BaseUrl 기본값)로만 할 수 있어요.' }
if (-not (Test-Path (Join-Path $kit 'src\DesktopKit.Setup'))) { throw "공용 모듈을 찾지 못했어요: $kit" }

function Run([string]$what, [scriptblock]$cmd) {
    Write-Host "▶ $what"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what 실패 (exit $LASTEXITCODE)" }
}

# 앱에 넣은 값 (Core/AppKit.cs) — 릴리스 도구가 이 공개키로 서명을 다시 확인한다
$appKit = [IO.File]::ReadAllText((Join-Path $desk 'src\EduDic.Core\AppKit.cs'))
$pubkey = [regex]::Match($appKit, 'PublicKey = "([^"]+)"').Groups[1].Value
$quitEvent = [regex]::Match($appKit, 'QuitEvent = "([^"]+)"').Groups[1].Value.Replace('\\', '\')
if (-not $pubkey -or -not $quitEvent) { throw 'AppKit.cs 에서 공개키·끝내기 신호를 찾지 못했어요.' }

# 1) 판
$text = [IO.File]::ReadAllText($props)
$cur = [regex]::Match($text, '<Version>(\d+)\.(\d+)\.(\d+)</Version>')
if (-not $cur.Success) { throw 'Directory.Build.props 에서 <Version> 을 찾지 못했어요.' }
$ma = [int]$cur.Groups[1].Value; $mi = [int]$cur.Groups[2].Value; $pa = [int]$cur.Groups[3].Value
if ($Version) { $next = $Version }
elseif ($Major) { $next = "$($ma + 1).0.0" }
elseif ($Minor) { $next = "$ma.$($mi + 1).0" }
else { $next = "$ma.$mi.$($pa + 1)" }
if ($next -notmatch '^\d+\.\d+\.\d+$') { throw "판 형식이 틀려요: $next" }
Write-Host "판 $ma.$mi.$pa → $next  ($Out)"
[IO.File]::WriteAllText($props, ($text -replace '<Version>[^<]+</Version>', "<Version>$next</Version>"), $utf8)
if (-not $Notes) { $Notes = "$next 판" }
$setupName = "EduDic-$next-Setup"

try {
    # 2) 시험 → 앱 폴더 게시
    if (-not $NoTest) { Run '시험' { & $dotnet test (Join-Path $desk 'tests\EduDic.Tests') --nologo -v q } }
    if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
    $app = Join-Path $Out 'app'
    Run '앱 게시 (폴더, .NET 포함)' { & $dotnet publish (Join-Path $desk 'src\EduDic.App') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $app --nologo -v q }

    # 3) 설치 파일 (kit DesktopKit.Setup, net48)
    $setupDir = Join-Path $Out '_setup'
    Run '설치 파일 빌드 (net48)' {
        & $dotnet publish (Join-Path $kit 'src\DesktopKit.Setup') -c Release -o $setupDir --nologo -v q `
            "-p:AssemblyName=$setupName" '-p:KitId=edu-dic' '-p:KitName=어린이 쉬운 사전 데스크탑' '-p:KitExe=어린이 쉬운 사전.exe' '-p:KitInstallDir=EduDic' `
            "-p:KitManifestUrl=$($BaseUrl)latest.json" "-p:KitPublicKey=$pubkey" '-p:KitSetupName=EduDic-Setup' `
            "-p:KitIcon=$(Join-Path $desk 'src\EduDic.App\app.ico')" '-p:KitPublisher=dic.dgedu.link' '-p:KitUrl=https://dic.dgedu.link' `
            '-p:KitNeedsWebView2=true' "-p:KitQuitEvent=$quitEvent" `
            '-p:KitDataNote=사전 설정과 화면 임시 파일(AppData\Local\EduDic)은 남겨 둬요. 필요 없으면 그 폴더를 지워도 돼요.'
    }
    $setup = Join-Path $setupDir "$setupName.exe"
    # 다리 판: 0.5.0 은 팩으로만 넘어와 설치 파일 사본이 없다 → 앱 팩에 실어 앱(LegacyMigration)이 설치 폴더에 놓게
    if ($Bridge) { Copy-Item $setup (Join-Path $app 'EduDic-Setup.exe') }

    # 4) 팩 · latest.json · 서명 (kit 릴리스 도구)
    $upDir = Join-Path $Out 'upload'
    Run '팩 · latest.json · 서명' {
        & $dotnet run --project (Join-Path $kit 'src\DesktopKit.Release') -c Release -- build `
            --publish $app --rules (Join-Path $PSScriptRoot 'packs.json') --out $upDir --id edu-dic --name '어린이 쉬운 사전 데스크탑' --version $next `
            --setup $setup --setup-file "$setupName.exe" --env $devVars --key DESKTOP_UPDATER_ECDSA_KEY --pubkey $pubkey --notes $Notes
    }

    # 5) 다리 판: 옛 매니페스트 (같은 팩·같은 설치 파일, 옛 서명 형식)
    if ($Bridge) {
        $legacy = Join-Path $Out 'legacy'
        New-Item -ItemType Directory -Force $legacy | Out-Null
        $minisign = ''
        if (Test-Path $tauriKey) {
            $tools = $PSScriptRoot
            if (-not (Test-Path (Join-Path $tools 'node_modules\@tauri-apps\cli'))) { Push-Location $tools; npm install --no-audit --no-fund; Pop-Location }
            $sigTmp = Join-Path $legacy 'setup.exe'
            Copy-Item $setup $sigTmp
            Run 'minisign 서명 (옛 Tauri 앱용)' { node (Join-Path $tools 'node_modules\@tauri-apps\cli\tauri.js') signer sign -f $tauriKey '--password=' $sigTmp | Out-Null }
            $minisign = ([IO.File]::ReadAllText("$sigTmp.sig")).Trim()
            Remove-Item $sigTmp, "$sigTmp.sig"
        } else {
            Write-Warning "옛 Tauri 서명 키($tauriKey)가 없어 옛 0.3.0 앱은 이 판을 받지 못해요."
        }
        Run '옛 매니페스트 (desktop-latest.json)' {
            & $dotnet run --project (Join-Path $PSScriptRoot 'EduDic.Sign') -c Release -- legacy $devVars (Join-Path $upDir 'latest.json') $setup `
                (Join-Path $legacy 'desktop-latest.json') $legacyPackBase $legacySetupUrl $minisign
        }
    }
    Remove-Item $setupDir -Recurse -Force

    # 6) 바뀐 점 기록
    if (-not $NoCommit) {
        $changelog = Join-Path $desk 'CHANGELOG.md'
        $log = [IO.File]::ReadAllText($changelog)
        $lines = ($Notes -split '\|' | Where-Object { $_.Trim() } | ForEach-Object { "- $($_.Trim())" }) -join "`n"
        $entry = "## $next — $(Get-Date -Format 'yyyy-MM-dd')`n`n$lines`n"
        $idx = $log.IndexOf("`n## ")
        $log = if ($idx -ge 0) { $log.Substring(0, $idx + 1) + "`n" + $entry + $log.Substring($idx + 1) } else { $log.TrimEnd() + "`n`n" + $entry }
        [IO.File]::WriteAllText($changelog, $log, $utf8)
    }
} catch {
    # 실패하면 판 번호를 되돌린다
    [IO.File]::WriteAllText($props, $text, $utf8)
    throw
}
Get-ChildItem $upDir | ForEach-Object { '{0,-80} {1,10:N1} MB' -f $_.Name, ($_.Length / 1MB) } | Write-Host

# 7) 커밋 (작성자는 워크스페이스 규칙대로)
if (-not $NoCommit) {
    & $git -C $repo add -- 'desktop/Directory.Build.props' 'desktop/CHANGELOG.md'
    & $git -C $repo -c user.name=eduinside -c user.email=parkjh85@gmail.com commit -m "chore(desktop): $next 릴리스 — $(($Notes -split '\|')[0])" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '커밋 실패' }
    Write-Host "커밋: chore(desktop): $next 릴리스"
}

# 8) 올리기 (R2) — 각 저장소에서 팩 → 설치 파일 → 매니페스트 순서 (매니페스트가 마지막이어야 앱이 없는 팩을 찾지 않는다)
if ($Upload) {
    if (-not (Test-Path (Join-Path $site 'wrangler.toml'))) { throw "byeduin-labs 를 찾지 못했어요: $site" }
    function Status([string]$url) {
        try { (Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 30).StatusCode }
        catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
    }
    $m = Get-Content (Join-Path $upDir 'latest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Push-Location $site
    try {
        foreach ($p in $m.packs) {
            if ((Status ($BaseUrl + $p.file)) -eq 200) { Write-Host "  팩 $($p.name) 이미 있음 — 건너뜀"; continue }
            Run "R2 팩 올리기 ($($p.name))" { npx wrangler r2 object put "byeduin-media/apps/edu-dic/$($p.file)" --file (Join-Path $upDir $p.file) --content-type 'application/zip' --remote }
        }
        Run 'R2 설치 파일 올리기' { npx wrangler r2 object put "byeduin-media/apps/edu-dic/$setupName.exe" --file (Join-Path $upDir "$setupName.exe") --content-type 'application/vnd.microsoft.portable-executable' --remote }
        Run 'R2 latest.json 올리기 (마지막)' { npx wrangler r2 object put 'byeduin-media/apps/edu-dic/latest.json' --file (Join-Path $upDir 'latest.json') --content-type 'application/json' --remote }
    } finally { Pop-Location }
    if ((Status ($BaseUrl + 'latest.json')) -ne 200) { throw "새 매니페스트를 받을 수 없어요 — 서빙 함수 DESKTOP_APPS 에 edu-dic 이 배포됐는지 확인: $($BaseUrl)latest.json" }
    Write-Host "새 저장소에 올렸어요: $($BaseUrl)latest.json"

    if ($Bridge) {
        $wrangler = Join-Path $repo 'node_modules\.bin\wrangler.cmd'
        if (-not (Test-Path $wrangler)) { throw 'wrangler 가 없어요 (dgedu-dic 에서 npm install).' }
        Push-Location $repo
        try {
            foreach ($p in $m.packs) {
                $url = $legacyPackBase + $p.sha256
                if ((Status $url) -eq 200) { Write-Host "  옛 팩 $($p.name) 이미 있음 — 건너뜀"; continue }
                Run "옛 R2 팩 올리기 ($($p.name))" { & $wrangler r2 object put "edu-dic-downloads/desktop-packs/$($p.sha256).zip" --file (Join-Path $upDir $p.file) --content-type 'application/zip' --remote }
                if ((Status $url) -ne 200) { throw "올린 팩을 내려받을 수 없어요: $url" }
            }
            Run '옛 R2 설치 파일 올리기' { & $wrangler r2 object put 'edu-dic-downloads/edu-dic-desktop-setup.exe' --file (Join-Path $upDir "$setupName.exe") --content-type 'application/x-msdownload' --remote }
            Run '옛 R2 매니페스트 올리기 (마지막)' { & $wrangler r2 object put 'edu-dic-downloads/desktop-latest.json' --file (Join-Path $Out 'legacy\desktop-latest.json') --content-type 'application/json' --remote }
        } finally { Pop-Location }
        Write-Host '옛 저장소에도 올렸어요: https://dic.dgedu.link/api/download/desktop-latest.json'
    }
} else {
    Write-Host '아직 올리지 않았어요. 확인한 뒤 -Upload.'
}
