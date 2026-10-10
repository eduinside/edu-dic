using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using EduDic.Core;

namespace EduDic.App;

/// <summary>
/// 자동 업데이트 (소수점 버전까지): 시작 20초 뒤와 6시간마다 매니페스트를 확인 → 더 높은 버전이면 내려받아
/// SHA-256·ECDSA 서명 확인 → 창이 숨겨져 있을 때 exe 를 바꾸고 다시 시작한다. 실패는 조용히 넘어가 다음에 다시.
/// 설치 폴더에서 실행 중일 때만 동작한다 (개발 실행·내려받기 폴더 실행 제외).
/// </summary>
public sealed class Updater(MainWindow window, Action shutdown) : IDisposable
{
    static readonly TimeSpan FirstCheck = TimeSpan.FromSeconds(20);
    static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(10) };
    readonly CancellationTokenSource stop = new();
    string? ready; // 검증을 마친 새 exe

    static string NewExe => AppPaths.InstallExe + ".new";
    static string OldExe => AppPaths.InstallExe + ".old";

    public void Start()
    {
        if (!AppPaths.RunningInstalled) return;
        try { if (File.Exists(OldExe)) File.Delete(OldExe); } catch (Exception) { }
        Installer.RefreshVersion();
        http.DefaultRequestHeaders.UserAgent.ParseAdd($"EduDicDesktop/{AppPaths.Version}");
        _ = Task.Run(async () =>
        {
            try
            {
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

    async Task CheckAsync(CancellationToken ct)
    {
        if (ready != null) { TryApply(); return; }
        using var req = new HttpRequestMessage(HttpMethod.Get, UpdateManifest.ManifestUrl);
        req.Headers.CacheControl = new() { NoCache = true };
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode) return;
        var m = UpdateManifest.Parse(await res.Content.ReadAsStringAsync(ct));
        if (m == null || !AppVersion.TryParse(AppPaths.Version, out var current) || !AppVersion.IsNewer(m.Version, current)) return;

        // 내려받기 → 해시·서명 확인 (하나라도 틀리면 버린다)
        await using (var src = await http.GetStreamAsync(m.Url, ct))
        await using (var dst = File.Create(NewExe))
            await src.CopyToAsync(dst, ct);
        var sha = UpdateSignature.Sha256Hex(NewExe);
        if (sha != m.Sha256 || !UpdateSignature.Verify(m.Version, sha, m.Signature))
        {
            File.Delete(NewExe);
            return;
        }
        ready = NewExe;
        TryApply();
    }

    /// <summary>창이 숨겨져 있을 때만 바꾼다 (낱말을 보고 있는 중에 꺼지지 않게)</summary>
    void TryApply()
    {
        if (ready == null) return;
        window.Dispatcher.BeginInvoke(() =>
        {
            if (ready == null || window.IsVisible) return;
            try
            {
                // 실행 중인 exe 는 지울 수는 없어도 이름은 바꿀 수 있다
                if (File.Exists(OldExe)) File.Delete(OldExe);
                File.Move(AppPaths.InstallExe, OldExe);
                try { File.Move(ready, AppPaths.InstallExe); }
                catch (Exception) { File.Move(OldExe, AppPaths.InstallExe); throw; }
                ready = null;
                Process.Start(new ProcessStartInfo(AppPaths.InstallExe, $"--wait-pid {Environment.ProcessId} --autostart")
                {
                    UseShellExecute = false,
                    WorkingDirectory = AppPaths.InstallDir,
                });
                shutdown();
            }
            catch (Exception)
            {
                ready = null; // 다음 확인 때 다시 내려받는다
            }
        });
    }

    public void Dispose()
    {
        stop.Cancel();
        http.Dispose();
    }
}
