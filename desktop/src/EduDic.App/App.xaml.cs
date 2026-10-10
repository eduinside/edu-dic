using System.Diagnostics;
using System.Windows;

namespace EduDic.App;

/// <summary>
/// 시작 순서: --uninstall → 제거 / --finish-install → 설치 마무리 후 앱 / 아니면 앱(트레이·단축키·자동 업데이트).
/// 설치는 설치 프로그램(EduDic.Setup)이 한다. 옵션: --autostart(창 없이 트레이로) · --fresh(처음 설치) · --wait-pid N(앞 프로세스를 기다림)
/// </summary>
public partial class App : Application
{
    MainWindow? window;
    Tray? tray;
    HotKey? hotKey;
    Updater? updater;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = e.Args;

        if (args.Contains("--uninstall"))
        {
            Installer.Uninstall(quiet: args.Contains("--quiet"));
            Shutdown();
            return;
        }

        var wi = Array.IndexOf(args, "--wait-pid");
        if (wi >= 0 && wi + 1 < args.Length && int.TryParse(args[wi + 1], out var pid))
        {
            try { using var old = Process.GetProcessById(pid); old.WaitForExit(15000); }
            catch (ArgumentException) { /* 이미 끝남 */ }
        }

        // 설치 프로그램이 파일을 깐 뒤: 바로가기·제거 정보·옛 앱 정리
        if (args.Contains("--finish-install")) Installer.Finish(fresh: args.Contains("--fresh"));

        if (!SingleInstance.Acquire(waitForPrevious: wi >= 0))
        {
            Shutdown();
            return;
        }

        window = new MainWindow();
        MainWindow = window;
        tray = new Tray(open: window.ShowAndFocus, openWeb: () => window.OpenUrl(AppPaths.WebUrl), quit: Quit);
        hotKey = new HotKey(() => window.Dispatcher.Invoke(window.Toggle));
        SingleInstance.Listen(
            show: () => window.Dispatcher.Invoke(window.ShowAndFocus),
            quit: () => window.Dispatcher.Invoke(Quit));
        updater = new Updater(window, Quit);
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
        if (args.Contains("--finish-install") && !args.Contains("--autostart"))
            tray.Balloon(AppPaths.ProductName, hotKey.Registered
                ? "설치했어요. 언제든 Ctrl+Alt+D 를 누르면 사전이 열려요."
                : "설치했어요. 트레이의 사전 아이콘을 누르면 열려요.");
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
