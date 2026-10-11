using System.Diagnostics;
using System.IO;
using System.Windows;
using DesktopKit;
using EduDic.Core;

namespace EduDic.App;

/// <summary>
/// 시작 순서: --uninstall → 설치 파일 사본에 넘김 / 아니면 앱(트레이·단축키·자동 업데이트).
/// 설치·제거는 공용 모듈 DesktopKit 의 설치 파일(EduDic-Setup.exe)이 한다. 옵션: --autostart(창 없이 트레이로) · --wait-pid N(앞 프로세스를 기다림)
/// </summary>
public partial class App : Application
{
    /// <summary>업데이트 확인 주기 (시작 1분 뒤 + 이만큼마다)</summary>
    static readonly TimeSpan CheckEvery = TimeSpan.FromHours(6);

    MainWindow? window;
    Tray? tray;
    HotKey? hotKey;
    KitUpdater? updater;
    bool restarting;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = e.Args;

        if (args.Contains("--uninstall"))
        {
            Uninstall(quiet: args.Contains("--quiet"));
            Shutdown();
            return;
        }

        // ‘다시 시작’·옛 업데이터가 새 판을 띄울 때 앞 판이 아직 떠 있다 → 단일 실행 확인보다 먼저 기다린다
        var wi = Array.IndexOf(args, "--wait-pid");
        if (wi >= 0 && wi + 1 < args.Length && int.TryParse(args[wi + 1], out var pid))
        {
            try { using var old = Process.GetProcessById(pid); old.WaitForExit(15000); }
            catch (ArgumentException) { /* 이미 끝남 */ }
        }

        if (!SingleInstance.Acquire(waitForPrevious: wi >= 0))
        {
            Shutdown();
            return;
        }

        // 옛 판에서 넘어온 설치를 kit 배치로 (KitUpdater 가 설치판으로 알아보게 먼저)
        LegacyMigration.Run();
        var settings = Settings.Load();

        window = new MainWindow();
        MainWindow = window;
        tray = new Tray(open: window.ShowAndFocus, openWeb: () => window.OpenUrl(AppPaths.WebUrl), quit: Quit, settings: settings);
        hotKey = new HotKey(() => window.Dispatcher.Invoke(window.Toggle));
        SingleInstance.Listen(
            show: () => window.Dispatcher.Invoke(window.ShowAndFocus),
            quit: () => window.Dispatcher.Invoke(Quit));

        // 자동 업데이트(설치판만): 바뀐 팩만 받아 새 판 폴더 → app 정션을 바꿔 둔다.
        // 늘 떠 있는 트레이 앱이라 ‘다음에 켤 때’를 기다리지 않고, 창이 숨겨져 있을 때 새 판으로 다시 시작한다(낱말을 보는 중엔 안 꺼짐)
        updater = new KitUpdater(AppKit.Info, AppPaths.Version, AppPaths.ExeDir, CheckEvery, () => true, () => settings.UsageStats);
        updater.Changed += RestartIfReady;
        window.IsVisibleChanged += (_, _) => RestartIfReady();
        updater.Start();

        if (args.Contains("--autostart"))
        {
            // 창 없이 트레이로: 화면 엔진만 미리 띄워 두면 단축키를 눌렀을 때 바로 나온다
            window.Opacity = 0;
            window.Show();
            window.Hide();
            window.Opacity = 1;
        }
        else
        {
            window.Show();
            window.ShowAndFocus();
        }
    }

    void RestartIfReady() => window?.Dispatcher.BeginInvoke(() =>
    {
        if (restarting || updater?.State != KitUpdateState.Ready || window == null || window.IsVisible) return;
        restarting = true;
        try
        {
            if (!updater.RestartNow(Quit, "--autostart")) restarting = false;
        }
        catch (Exception) { restarting = false; /* 다음에 켤 때 새 판 */ }
    });

    /// <summary>
    /// 옛 제거 정보(0.5.0 까지 — 앱 exe --uninstall)로 지울 때: kit 설치 파일 사본에 넘긴다 (다리 판이 제거 정보를 바꾸기 전에 지우는 경우)
    /// </summary>
    static void Uninstall(bool quiet)
    {
        var setup = AppKit.Info.SetupCopy;
        if (File.Exists(setup))
        {
            Process.Start(new ProcessStartInfo(setup, "--uninstall" + (quiet ? " --quiet" : "")) { UseShellExecute = false, WorkingDirectory = Path.GetTempPath() });
            return;
        }
        if (!quiet)
            MessageBox.Show("지우는 프로그램을 찾지 못했어요.\n\ndic.dgedu.link 에서 설치 파일을 받아 한 번 실행한 뒤 ‘앱 및 기능’에서 지워 주세요.",
                AppPaths.ProductName, MessageBoxButton.OK, MessageBoxImage.Information);
    }

    void Quit()
    {
        updater?.Dispose();
        hotKey?.Dispose();
        tray?.Dispose();
        window?.Quit();
        Shutdown();
    }
}
