# 어린이 쉬운 사전 데스크탑 릴리스 — 버전 올리기부터 배포까지 한 번에 (docs/plan-desktop-dotnet.md §4)
# 사용: powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Notes "바뀐 점" [-Minor|-Major|-Version x.y.z] [-Upload] [-NoCommit]
#   기본은 패치 번호 +1 (0.4.0 → 0.4.1). -Upload 를 붙여야 실제로 배포된다(R2) — 설치된 앱은 6시간 안에 스스로 바뀐다.
#   만드는 것: release\어린이 쉬운 사전.exe · release\desktop-latest.json
param(
    [string]$Notes = '',
    [switch]$Minor,
    [switch]$Major,
    [string]$Version,
    [switch]$Upload,
    [switch]$NoCommit
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
$out = Join-Path $desk 'release'
$exeName = '어린이 쉬운 사전.exe'
$downloadUrl = 'https://dic.dgedu.link/api/download/desktop'
$utf8 = New-Object System.Text.UTF8Encoding $false

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
    # 2) 시험 → 게시
    Run '시험' { & $dotnet test (Join-Path $desk 'tests\EduDic.Tests') --nologo -v q }
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    Run '게시(단일 exe)' { & $dotnet publish (Join-Path $desk 'src\EduDic.App') -c Release -o $out --nologo -v q }
    Get-ChildItem $out | Where-Object { $_.Name -ne $exeName } | Remove-Item -Recurse -Force
    $exe = Join-Path $out $exeName

    # 3) 새 앱용 서명 (SHA-256 + ECDSA)
    Run '서명 도구 빌드' { & $dotnet build (Join-Path $desk 'tools\EduDic.Sign') -c Release --nologo -v q }
    $signDll = Join-Path $desk 'tools\EduDic.Sign\bin\Release\net10.0\EduDic.Sign.dll'
    $sigJson = & $dotnet $signDll sign $devVars $exe $next
    if ($LASTEXITCODE -ne 0) { throw 'ECDSA 서명 실패 (.dev.vars 의 DESKTOP_UPDATER_ECDSA_KEY 확인)' }
    $sig = $sigJson | ConvertFrom-Json

    # 4) 옛 Tauri 앱용 서명 (minisign) — 옛 앱이 이 파일을 새 버전으로 받아 설치기로 실행한다
    $minisign = $null
    if (Test-Path $tauriKey) {
        $tools = Join-Path $desk 'tools'
        if (-not (Test-Path (Join-Path $tools 'node_modules\@tauri-apps\cli'))) { Push-Location $tools; npm install --no-audit --no-fund; Pop-Location }
        Run 'minisign 서명' { node (Join-Path $tools 'node_modules\@tauri-apps\cli\tauri.js') signer sign -f $tauriKey '--password=' $exe }
        $minisign = ([IO.File]::ReadAllText("$exe.sig")).Trim()
        Remove-Item "$exe.sig"
    } else {
        Write-Warning "옛 Tauri 서명 키($tauriKey)가 없어 옛 0.3.0 앱은 이 버전을 받지 못해요."
    }

    # 5) 매니페스트 (옛 Tauri 앱과 새 앱이 함께 읽는다)
    if (-not $Notes) { $Notes = "$next 버전" }
    $manifest = [ordered]@{
        version   = $next
        notes     = $Notes
        pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        platforms = [ordered]@{ 'windows-x86_64' = [ordered]@{ signature = $(if ($minisign) { $minisign } else { '' }); url = $downloadUrl } }
        sha256    = $sig.sha256
        ecdsa     = $sig.ecdsa
    }
    $manifestPath = Join-Path $out 'desktop-latest.json'
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8)

    # 6) 바뀐 점 기록
    $changelog = Join-Path $desk 'CHANGELOG.md'
    $log = if (Test-Path $changelog) { [IO.File]::ReadAllText($changelog) } else { "# 어린이 쉬운 사전 데스크탑 바뀐 점`n" }
    $entry = "## $next — $(Get-Date -Format 'yyyy-MM-dd')`n`n- $Notes`n"
    $idx = $log.IndexOf("`n## ")
    $log = if ($idx -ge 0) { $log.Substring(0, $idx + 1) + "`n" + $entry + $log.Substring($idx + 1) } else { $log.TrimEnd() + "`n`n" + $entry }
    [IO.File]::WriteAllText($changelog, $log, $utf8)
} catch {
    # 실패하면 버전 번호를 되돌린다
    [IO.File]::WriteAllText($props, $text, $utf8)
    throw
}

$size = (Get-Item $exe).Length / 1MB
Write-Host ("완료: {0} ({1:N1} MB) · sha256 {2}" -f $exe, $size, $sig.sha256)

# 7) 커밋
if (-not $NoCommit) {
    & $git -C $repo add -- 'desktop/Directory.Build.props' 'desktop/CHANGELOG.md'
    & $git -C $repo commit -m "chore(desktop): $next 릴리스 — $Notes" | Out-Null
    Write-Host "커밋: chore(desktop): $next 릴리스"
}

# 8) 배포 (R2)
if ($Upload) {
    $wrangler = Join-Path $repo 'node_modules\.bin\wrangler.cmd'
    if (-not (Test-Path $wrangler)) { throw 'wrangler 가 없어요 (dgedu-dic 에서 npm install).' }
    Push-Location $repo
    try {
        Run 'R2 설치 파일 올리기' { & $wrangler r2 object put 'edu-dic-downloads/edu-dic-desktop-setup.exe' --file $exe --content-type 'application/x-msdownload' --remote }
        Run 'R2 매니페스트 올리기' { & $wrangler r2 object put 'edu-dic-downloads/desktop-latest.json' --file $manifestPath --content-type 'application/json' --remote }
    } finally { Pop-Location }
    Write-Host "배포했어요. 확인: curl -s https://dic.dgedu.link/api/download/desktop-latest.json"
} else {
    Write-Host '아직 배포하지 않았어요. 배포하려면 -Upload (또는 release 폴더 두 파일을 R2 에 직접 올리기).'
}
