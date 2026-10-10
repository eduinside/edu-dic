using System.Diagnostics;
using System.IO;
using System.Net.Http;
using EduDic.Core;

namespace EduDic.App;

/// <summary>
/// 자동 업데이트 (소수점 버전까지, 변경분만): 시작 20초 뒤와 6시간마다 매니페스트를 확인 → 더 높은 버전이면
/// 바뀐 팩만 내려받아 해시·서명 확인 → 새 버전 폴더를 만들고(안 바뀐 팩은 지금 폴더에서 하드 링크)
/// 창이 숨겨져 있을 때 app 정션을 바꾸고 다시 시작한다. 실패는 조용히 넘어가 다음에 다시 (docs/plan-desktop-dotnet.md §7).
/// 설치된 앱으로 실행 중일 때만 동작한다 (개발 실행 제외).
/// </summary>
public sealed class Updater(MainWindow window, Action shutdown) : IDisposable
{
    static readonly TimeSpan FirstCheck = TimeSpan.FromSeconds(20);
    static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(20) };
    readonly CancellationTokenSource stop = new();
    string? ready; // 다 만든 새 버전 폴더

    public void Start()
    {
        if (!AppPaths.RunningInstalled) return;
        Installer.RefreshVersion();
        http.DefaultRequestHeaders.UserAgent.ParseAdd($"EduDicDesktop/{AppPaths.Version}");
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(3), stop.Token);
                CleanUp();
                await Task.Delay(FirstCheck, stop.Token);
                while (!stop.IsCancellationRequested)
                {
                    try { await CheckAsync(stop.Token); } catch (Exception e) when (e is not OperationCanceledException) { }
                    await Task.Delay(Interval, stop.Token);
                }
            }
            catch (OperationCanceledException) { }
        });
        // 창을 숨기는 순간 준비된 업데이트를 적용
        window.IsVisibleChanged += (_, _) => { if (!window.IsVisible) TryApply(); };
    }

    /// <summary>지난 버전 폴더·만들다 만 폴더·0.4.x 단일 exe 정리 (쓰는 중이면 다음에)</summary>
    static void CleanUp()
    {
        var own = Path.GetFullPath(AppPaths.OwnVersionDir).TrimEnd('\\');
        if (Directory.Exists(InstallLayout.VersionsDir))
            foreach (var d in Directory.GetDirectories(InstallLayout.VersionsDir))
                if (!string.Equals(Path.GetFullPath(d).TrimEnd('\\'), own, StringComparison.OrdinalIgnoreCase))
                    try { Directory.Delete(d, true); } catch (Exception) { }
        foreach (var f in new[] { InstallLayout.LegacyExe, InstallLayout.LegacyExe + ".old", InstallLayout.LegacyExe + ".new" })
            try { if (File.Exists(f)) File.Delete(f); } catch (Exception) { }
    }

    async Task CheckAsync(CancellationToken ct)
    {
        if (ready != null) { TryApply(); return; }
        using var req = new HttpRequestMessage(HttpMethod.Get, InstallLayout.EffectiveManifestUrl);
        req.Headers.CacheControl = new() { NoCache = true };
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode) return;
        var m = UpdateManifest.Parse(await res.Content.ReadAsStringAsync(ct));
        if (m == null || !m.Verified()) return;
        if (!AppVersion.TryParse(AppPaths.Version, out var current) || !AppVersion.IsNewer(m.Version, current)) return;

        var dir = InstallLayout.VersionDir(AppVersion.Text(m.Version));
        await Packs.BuildAsync(dir, m.Packs.ToList(), AppPaths.OwnVersionDir, async (pack, path) =>
        {
            await using var src = await http.GetStreamAsync(pack.Url, ct);
            await using var dst = File.Create(path);
            await src.CopyToAsync(dst, ct);
        });
        ready = dir;
        TryApply();
    }

    /// <summary>창이 숨겨져 있을 때만 바꾼다 (낱말을 보고 있는 중에 꺼지지 않게)</summary>
    void TryApply()
    {
        if (ready == null) return;
        window.Dispatcher.BeginInvoke(() =>
        {
            if (ready == null || window.IsVisible) return;
            var dir = ready;
            ready = null;
            try
            {
                var exe = Path.Combine(dir, AppPaths.ExeName);
                if (!File.Exists(exe)) return;
                InstallLayout.PointAppTo(dir);
                Process.Start(new ProcessStartInfo(exe, $"--wait-pid {Environment.ProcessId} --autostart")
                {
                    UseShellExecute = false,
                    WorkingDirectory = dir,
                });
                shutdown();
            }
            catch (Exception)
            {
                // 정션을 못 바꿨으면 지금 버전으로 되돌려 두고 다음 확인 때 다시
                try { InstallLayout.PointAppTo(AppPaths.OwnVersionDir); } catch (Exception) { }
            }
        });
    }

    public void Dispose()
    {
        stop.Cancel();
        http.Dispose();
    }
}
