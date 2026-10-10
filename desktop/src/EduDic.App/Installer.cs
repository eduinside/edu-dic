using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Win32;

namespace EduDic.App;

/// <summary>
/// 설치 마무리 · 제거. 파일은 설치 프로그램(EduDic.Setup)이 versions\버전 에 깔고 app 정션을 맞춘 뒤
/// 앱을 --finish-install 로 띄운다 → 여기서 바로가기·제거 정보·시작 프로그램을 맞추고, 옛 앱을 정리한다:
/// 옛 Tauri 앱(0.3.0 이하)은 제거 프로그램으로, 0.4.x 단일 exe 는 파일만 지운다 (docs/plan-desktop-dotnet.md §3, §7).
/// </summary>
public static class Installer
{
    const string UninstallRoot = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    const string UninstallKey = UninstallRoot + @"\EduDicDesktop";
    const string OldProcess = "edu-dic-desktop"; // Tauri 앱 exe 이름

    static string StartMenuLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppPaths.ProductName + ".lnk");
    static string DesktopLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppPaths.ProductName + ".lnk");

    /// <summary>설치 프로그램이 파일을 깐 뒤 부른다. fresh = 이 PC에 처음 설치</summary>
    public static void Finish(bool fresh)
    {
        try
        {
            foreach (var p in Process.GetProcessesByName(OldProcess))
                using (p) { try { p.Kill(); p.WaitForExit(5000); } catch (Exception) { } }

            // 시작 프로그램 등록은 옛 앱 것까지 기억해 두었다가 새 경로로 다시 건다
            var autostart = Autostart.IsEnabled;
            var oldRemoved = RemoveTauriApp();
            var hadDesktopLink = File.Exists(DesktopLink);

            CreateShortcut(StartMenuLink);
            if (fresh || oldRemoved || hadDesktopLink) CreateShortcut(DesktopLink);
            WriteUninstallInfo();
            if (autostart) Autostart.Set(true, AppPaths.InstallExe);
        }
        catch (Exception e)
        {
            MessageBox.Show($"설치를 마무리하지 못했어요.\n\n{e.Message}", AppPaths.ProductName, MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    /// <summary>옛 Tauri(NSIS) 설치본을 제거 프로그램으로 조용히 지운다. 지웠으면 true</summary>
    static bool RemoveTauriApp()
    {
        using var root = Registry.CurrentUser.OpenSubKey(UninstallRoot);
        if (root == null) return false;
        var removed = false;
        foreach (var name in root.GetSubKeyNames())
        {
            if (name == "EduDicDesktop") continue;
            using var k = root.OpenSubKey(name);
            if (k?.GetValue("DisplayName") is not string dn || !dn.StartsWith("어린이 쉬운 사전", StringComparison.Ordinal)) continue;
            if (k.GetValue("UninstallString") is not string us) continue;
            var exe = us.Trim().Trim('"');
            if (!File.Exists(exe)) continue;
            try
            {
                using var p = Process.Start(new ProcessStartInfo(exe, "/S") { UseShellExecute = false, CreateNoWindow = true });
                p?.WaitForExit(60_000);
                // NSIS 제거 프로그램은 임시 폴더로 자신을 복사해 다시 띄우고 바로 끝난다 — 실제 제거가 끝나야(제거 정보가 사라져야)
                // 다음으로 간다. 안 기다리면 늦게 도는 옛 제거가 같은 이름의 새 바로가기를 지워 버린다 (2026-10-10 실기 확인)
                var until = DateTime.UtcNow.AddSeconds(60);
                while (DateTime.UtcNow < until)
                {
                    using var still = Registry.CurrentUser.OpenSubKey($@"{UninstallRoot}\{name}");
                    if (still == null) break;
                    Thread.Sleep(300);
                }
                Thread.Sleep(1000); // 마지막 파일 정리 여유
                removed = true;
            }
            catch (Exception) { /* 제거 프로그램이 안 돌아도 새 앱 설치는 계속 */ }
        }
        return removed;
    }

    static void CreateShortcut(string lnkPath)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return;
            dynamic shell = Activator.CreateInstance(type)!;
            var lnk = shell.CreateShortcut(lnkPath);
            lnk.TargetPath = AppPaths.InstallExe;
            lnk.WorkingDirectory = Core.InstallLayout.AppDir;
            lnk.IconLocation = AppPaths.InstallExe + ",0";
            lnk.Description = "궁금한 낱말을 바로 찾아요 (Ctrl+Alt+D)";
            lnk.Save();
        }
        catch (Exception) { /* 바로가기는 편의 기능 */ }
    }

    static void WriteUninstallInfo()
    {
        using var k = Registry.CurrentUser.CreateSubKey(UninstallKey);
        k.SetValue("DisplayName", AppPaths.ProductName);
        k.SetValue("DisplayVersion", AppPaths.Version);
        k.SetValue("DisplayIcon", AppPaths.InstallExe + ",0");
        k.SetValue("Publisher", "dic.dgedu.link");
        k.SetValue("URLInfoAbout", AppPaths.WebUrl);
        k.SetValue("InstallLocation", AppPaths.InstallDir);
        k.SetValue("UninstallString", $"\"{AppPaths.InstallExe}\" --uninstall");
        k.SetValue("QuietUninstallString", $"\"{AppPaths.InstallExe}\" --uninstall --quiet");
        k.SetValue("NoModify", 1, RegistryValueKind.DWord);
        k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        try
        {
            var bytes = new DirectoryInfo(AppPaths.OwnVersionDir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length);
            k.SetValue("EstimatedSize", (int)(bytes / 1024), RegistryValueKind.DWord);
        }
        catch (IOException) { }
    }

    /// <summary>자동 업데이트 뒤 ‘앱 및 기능’의 버전 표시를 맞춘다</summary>
    public static void RefreshVersion()
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(UninstallKey, writable: true);
            k?.SetValue("DisplayVersion", AppPaths.Version);
        }
        catch (Exception) { }
    }

    public static void Uninstall(bool quiet)
    {
        if (!quiet && MessageBox.Show("어린이 쉬운 사전 데스크탑을 지울까요?", AppPaths.ProductName, MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;
        Core.InstallLayout.QuitRunning(TimeSpan.FromSeconds(10));
        try { Autostart.Set(false, AppPaths.InstallExe); } catch (Exception) { }
        foreach (var l in new[] { StartMenuLink, DesktopLink }) try { File.Delete(l); } catch (Exception) { }
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, throwOnMissingSubKey: false); } catch (Exception) { }
        // 실행 중인 버전 폴더·막 끈 화면 엔진(WebView2)이 잡고 있는 데이터 폴더는 바로 못 지운다
        // → 이 프로세스가 끝난 뒤 둘 다 지운다 (30초까지 다시 시도). 0.4.x 가 %TEMP%\.net 에 풀어 둔 DLL 폴더도 함께
        var dir = AppPaths.InstallDir;
        var data = AppPaths.DataDir;
        var extracted = Path.Combine(Path.GetTempPath(), ".net", Path.GetFileNameWithoutExtension(AppPaths.ExeName));
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c for /l %i in (1,1,30) do (ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{dir}\" 2> nul & rmdir /s /q \"{data}\" 2> nul & rmdir /s /q \"{extracted}\" 2> nul & if not exist \"{dir}\" if not exist \"{data}\" exit)")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetTempPath(),
        });
        if (!quiet) MessageBox.Show("지웠어요.", AppPaths.ProductName, MessageBoxButton.OK, MessageBoxImage.Information);
    }
}
