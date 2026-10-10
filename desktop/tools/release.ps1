# 어린이 쉬운 사전 데스크탑 릴리스 — 버전 올리기부터 배포까지 한 번에 (docs/plan-desktop-dotnet.md §4, §7)
# 사용: powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점" [-Minor|-Major|-Version x.y.z] [-Upload] [-NoCommit]
#   기본은 패치 번호 +1 (0.5.0 → 0.5.1). -Upload 를 붙여야 실제로 배포된다(R2) — 설치된 앱은 6시간 안에 바뀐 팩만 받아 스스로 바뀐다.
#   만드는 것(release\): 어린이 쉬운 사전 설치.exe · packs\<sha256>.zip · desktop-latest.json · app\(게시 폴더)
#   시험용: -Out <폴더> -PackBase http://127.0.0.1:포트/packs/ -NoCommit → 로컬 서버로 설치·업데이트를 먼저 확인 (EDUDIC_UPDATE_URL)
param(
    [string]$Notes = '',
    [switch]$Minor,
    [switch]$Major,
    [string]$Version,
    [switch]$Upload,
    [switch]$NoCommit,
    [string]$Out,
    [string]$PackBase = 'https://dic.dgedu.link/api/download/pack/'
)
$ErrorActionPreference = 'Stop'
$desk = Split-Path -Parent $PSScriptRoot          # desktop\
$repo = Split-Path -Parent $desk                  # dgedu-dic\
$dotnet = 'D:\Setup\DevTools\dotnet\dotnet.exe'
if (-not (Test-Path $dotnet)) { $dotnet = 'dotnet' }
$git = 'D:\Setup\DevTools\Git\bin\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }
$props = Join-Path $desk 'Directory.Build.props'
$devVars = Join-Path $repo '.dev.vars'
$tauriKey = Join-Path $desk 'src-tauri\updater.key'
if (-not $Out) { $Out = Join-Path $desk 'release' }
$setupName = '어린이 쉬운 사전 설치.exe'
$downloadUrl = 'https://dic.dgedu.link/api/download/desktop'
$utf8 = New-Object System.Text.UTF8Encoding $false
if ($Upload -and $PackBase -notlike 'https://dic.dgedu.link/*') { throw '-Upload 는 운영 팩 주소(-PackBase 기본값)로만 할 수 있어요.' }

function Run([string]$what, [scriptblock]$cmd) {
    Write-Host "▶ $what"
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what 실패 (exit $LASTEXITCODE)" }
}

# 1) 버전
$text = [IO.File]::ReadAllText($props)
$cur = [regex]::Match($text, '<Version>(\d+)\.(\d+)\.(\d+)</Version>')
if (-not $cur.Success) { throw 'Directory.Build.props 에서 <Version> 을 찾지 못했어요.' }
$ma = [int]$cur.Groups[1].Value; $mi = [int]$cur.Groups[2].Value; $pa = [int]$cur.Groups[3].Value
if ($Version) { $next = $Version }
elseif ($Major) { $next = "$($ma + 1).0.0" }
elseif ($Minor) { $next = "$ma.$($mi + 1).0" }
else { $next = "$ma.$mi.$($pa + 1)" }
if ($next -notmatch '^\d+\.\d+\.\d+$') { throw "버전 형식이 틀려요: $next" }
Write-Host "버전 $ma.$mi.$pa → $next"
[IO.File]::WriteAllText($props, ($text -replace '<Version>[^<]+</Version>', "<Version>$next</Version>"), $utf8)

try {
    # 2) 시험 → 앱 폴더 게시 → 설치 프로그램
    Run '시험' { & $dotnet test (Join-Path $desk 'tests\EduDic.Tests') --nologo -v q }
    if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
    $appOut = Join-Path $Out 'app'
    Run '앱 게시(폴더)' { & $dotnet publish (Join-Path $desk 'src\EduDic.App') -c Release -o $appOut --nologo -v q }
    $setupOut = Join-Path $Out '_setup'
    Run '설치 프로그램 빌드' { & $dotnet publish (Join-Path $desk 'src\EduDic.Setup') -c Release -o $setupOut --nologo -v q }
    $setup = Join-Path $Out $setupName
    Move-Item (Join-Path $setupOut $setupName) $setup
    Remove-Item $setupOut -Recurse -Force

    # 3) 팩(app·web·runtime) + 팩 목록 서명
    Run '서명 도구 빌드' { & $dotnet build (Join-Path $desk 'tools\EduDic.Sign') -c Release --nologo -v q }
    $signDll = Join-Path $desk 'tools\EduDic.Sign\bin\Release\net10.0\EduDic.Sign.dll'
    Write-Host '▶ 팩 만들기'
    $packsJson = & $dotnet $signDll packs $devVars $appOut (Join-Path $Out 'packs') $next $PackBase
    if ($LASTEXITCODE -ne 0) { throw '팩 만들기·서명 실패 (.dev.vars 의 DESKTOP_UPDATER_ECDSA_KEY 확인)' }
    $packs = $packsJson | ConvertFrom-Json

    # 4) 설치 프로그램 서명 — 0.4.x 앱(sha256·ecdsa)과 옛 Tauri 앱(minisign)이 이 파일을 받아 실행한다
    $sigJson = & $dotnet $signDll sign $devVars $setup $next
    if ($LASTEXITCODE -ne 0) { throw '설치 프로그램 서명 실패' }
    $sig = $sigJson | ConvertFrom-Json
    $minisign = ''
    if (Test-Path $tauriKey) {
        $tools = Join-Path $desk 'tools'
        if (-not (Test-Path (Join-Path $tools 'node_modules\@tauri-apps\cli'))) { Push-Location $tools; npm install --no-audit --no-fund; Pop-Location }
        Run 'minisign 서명' { node (Join-Path $tools 'node_modules\@tauri-apps\cli\tauri.js') signer sign -f $tauriKey '--password=' $setup | Out-Null }
        $minisign = ([IO.File]::ReadAllText("$setup.sig")).Trim()
        Remove-Item "$setup.sig"
    } else {
        Write-Warning "옛 Tauri 서명 키($tauriKey)가 없어 옛 0.3.0 앱은 이 버전을 받지 못해요."
    }

    # 5) 매니페스트 (옛 Tauri 앱 · 0.4.x 앱 · 0.5+ 앱이 함께 읽는다)
    if (-not $Notes) { $Notes = "$next 버전" }
    $manifest = [ordered]@{
        version    = $next
        notes      = $Notes
        pub_date   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        platforms  = [ordered]@{ 'windows-x86_64' = [ordered]@{ signature = $minisign; url = $downloadUrl } }
        sha256     = $sig.sha256
        ecdsa      = $sig.ecdsa
        packs      = @($packs.packs)
        packsEcdsa = $packs.packsEcdsa
    }
    $manifestPath = Join-Path $Out 'desktop-latest.json'
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), $utf8)

    # 6) 바뀐 점 기록
    if (-not $NoCommit) {
        $changelog = Join-Path $desk 'CHANGELOG.md'
        $log = if (Test-Path $changelog) { [IO.File]::ReadAllText($changelog) } else { "# 어린이 쉬운 사전 데스크탑 바뀐 점`n" }
        $entry = "## $next — $(Get-Date -Format 'yyyy-MM-dd')`n`n- $Notes`n"
        $idx = $log.IndexOf("`n## ")
        $log = if ($idx -ge 0) { $log.Substring(0, $idx + 1) + "`n" + $entry + $log.Substring($idx + 1) } else { $log.TrimEnd() + "`n`n" + $entry }
        [IO.File]::WriteAllText($changelog, $log, $utf8)
    }
} catch {
    # 실패하면 버전 번호를 되돌린다
    [IO.File]::WriteAllText($props, $text, $utf8)
    throw
}

$sizes = ($packs.packs | ForEach-Object { '{0} {1:N1}MB' -f $_.name, ($_.size / 1MB) }) -join ' · '
Write-Host ("완료: 설치 프로그램 {0:N0} KB · 팩 {1}" -f ((Get-Item $setup).Length / 1KB), $sizes)

# 7) 커밋
if (-not $NoCommit) {
    & $git -C $repo add -- 'desktop/Directory.Build.props' 'desktop/CHANGELOG.md'
    # git 사용자 설정이 없는 PC면 마지막 커밋의 작성자를 그대로 쓴다
    $who = @()
    if (-not (& $git -C $repo config user.email)) {
        $a = (& $git -C $repo log -1 --format='%an|%ae').Split('|')
        $who = @('-c', "user.name=$($a[0])", '-c', "user.email=$($a[1])")
    }
    & $git -C $repo @who commit -m "chore(desktop): $next 릴리스 — $Notes" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '커밋 실패' }
    Write-Host "커밋: chore(desktop): $next 릴리스"
}

# 8) 배포 (R2): 팩 → 설치 프로그램 → 매니페스트 순서 (매니페스트가 마지막이어야 앱이 없는 팩을 찾지 않는다)
if ($Upload) {
    $wrangler = Join-Path $repo 'node_modules\.bin\wrangler.cmd'
    if (-not (Test-Path $wrangler)) { throw 'wrangler 가 없어요 (dgedu-dic 에서 npm install).' }
    function Status([string]$url) {
        try { (Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 30).StatusCode }
        catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
    }
    # 팩을 내려 주는 서버 함수(functions/api/download/pack)가 먼저 배포돼 있어야 한다 — 없는 팩이면 404 가 와야 정상
    if ((Status ($PackBase + ('0' * 64))) -ne 404) { throw '팩 서버 함수가 아직 배포되지 않았어요 (git push 후 Pages 배포를 기다린 뒤 다시).' }
    Push-Location $repo
    try {
        foreach ($p in $packs.packs) {
            if ((Status $p.url) -eq 200) { Write-Host "  팩 $($p.name) 이미 있음 — 건너뜀"; continue }
            Run "R2 팩 올리기 ($($p.name))" { & $wrangler r2 object put "edu-dic-downloads/desktop-packs/$($p.sha256).zip" --file (Join-Path $Out "packs\$($p.sha256).zip") --content-type 'application/zip' --remote }
            if ((Status $p.url) -ne 200) { throw "올린 팩을 내려받을 수 없어요: $($p.url)" }
        }
        Run 'R2 설치 프로그램 올리기' { & $wrangler r2 object put 'edu-dic-downloads/edu-dic-desktop-setup.exe' --file $setup --content-type 'application/x-msdownload' --remote }
        Run 'R2 매니페스트 올리기' { & $wrangler r2 object put 'edu-dic-downloads/desktop-latest.json' --file $manifestPath --content-type 'application/json' --remote }
    } finally { Pop-Location }
    Write-Host "배포했어요. 확인: curl -s https://dic.dgedu.link/api/download/desktop-latest.json"
} else {
    Write-Host '아직 배포하지 않았어요. 배포하려면 -Upload.'
}
