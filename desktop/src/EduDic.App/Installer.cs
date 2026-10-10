using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Win32;

namespace EduDic.App;

/// <summary>
/// 스스로 설치하는 exe. 설치 폴더 밖(내려받기 폴더·옛 Tauri 업데이터의 임시 폴더)에서 실행되면
/// 자신을 %LOCALAPPDATA%\Programs\EduDic 에 복사하고 바로가기·제거 정보를 만든 뒤 설치한 앱을 띄운다.
/// 옛 Tauri 앱(0.3.0 이하)이 있으면 조용히 지우고 시작 프로그램 등록은 이어 받는다 (docs/plan-desktop-dotnet.md §3).
/// </summary>
public static class Installer
{
    const string UninstallRoot = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    const string UninstallKey = UninstallRoot + @"\EduDicDesktop";
    const string OldProcess = "edu-dic-desktop"; // Tauri 앱 exe 이름

    static string StartMenuLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppPaths.ProductName + ".lnk");
    static string DesktopLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppPaths.ProductName + ".lnk");

    /// <summary>설치기로 동작해야 하나: 배포판(Release)이고 설치 폴더 밖에서 실행됐을 때</summary>
    public static bool ShouldInstall(string[] args)
    {
#if DEBUG
        return args.Contains("--install");
#else
        return !AppPaths.RunningInstalled && !args.Contains("--no-install") && Environment.GetEnvironmentVariable("EDUDIC_NO_INSTALL") == null;
#endif
    }

    public static void Install()
    {
        try
        {
            var fresh = !File.Exists(AppPaths.InstallExe);
            // 1) 떠 있는 앱 끄기: 새 앱 → 신호, 옛 Tauri 앱 → 프로세스 종료
            SingleInstance.QuitRunning(TimeSpan.FromSeconds(10));
            foreach (var p in Process.GetProcessesByName(OldProcess))
                using (p) { try { p.Kill(); p.WaitForExit(5000); } catch (Exception) { } }

            // 2) 옛 Tauri 앱 정리 (시작 프로그램 등록 여부는 먼저 기억해 둔다)
            var autostart = Autostart.IsEnabled;
            var oldRemoved = RemoveTauriApp();

            // 3) 자신을 설치 폴더로 복사
            Directory.CreateDirectory(AppPaths.InstallDir);
            CopyWithRetry(AppPaths.CurrentExe, AppPaths.InstallExe);

            // 4) 바로가기·제거 정보·시작 프로그램
            CreateShortcut(StartMenuLink);
            if (fresh || oldRemoved) CreateShortcut(DesktopLink);
            WriteUninstallInfo();
            if (autostart) Autostart.Set(true, AppPaths.InstallExe);

            Process.Start(new ProcessStartInfo(AppPaths.InstallExe, "--installed") { UseShellExecute = false, WorkingDirectory = AppPaths.InstallDir });
        }
        catch (Exception e)
        {
            MessageBox.Show($"설치하지 못했어요.\n\n{e.Message}", AppPaths.ProductName, MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    static void CopyWithRetry(string from, string to)
    {
        if (string.Equals(Path.GetFullPath(from), Path.GetFullPath(to), StringComparison.OrdinalIgnoreCase)) return;
        for (var i = 0; ; i++)
        {
            try { File.Copy(from, to, overwrite: true); return; }
            catch (IOException) when (i < 20) { Thread.Sleep(500); } // 앞 프로세스가 아직 파일을 잡고 있음
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
            lnk.WorkingDirectory = AppPaths.InstallDir;
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
        try { k.SetValue("EstimatedSize", (int)(new FileInfo(AppPaths.InstallExe).Length / 1024), RegistryValueKind.DWord); } catch (IOException) { }
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
        SingleInstance.QuitRunning(TimeSpan.FromSeconds(10));
        try { Autostart.Set(false, AppPaths.InstallExe); } catch (Exception) { }
        foreach (var l in new[] { StartMenuLink, DesktopLink }) try { File.Delete(l); } catch (Exception) { }
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, throwOnMissingSubKey: false); } catch (Exception) { }
        try { Directory.Delete(AppPaths.DataDir, recursive: true); } catch (Exception) { }
        // 실행 중인 exe 와 그 exe 가 %TEMP%\.net 에 풀어 둔 DLL 은 바로 못 지운다(지우다 말면 다음 실행이 깨진다)
        // → 이 프로세스가 끝난 뒤 둘 다 폴더째 지운다 (끝나는 데 몇 초 걸려 30초까지 다시 시도)
        var dir = AppPaths.InstallDir;
        var extracted = Path.Combine(Path.GetTempPath(), ".net", Path.GetFileNameWithoutExtension(AppPaths.ExeName));
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c for /l %i in (1,1,30) do (ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{dir}\" 2> nul & if not exist \"{dir}\" (rmdir /s /q \"{extracted}\" 2> nul & exit))")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetTempPath(),
        });
        if (!quiet) MessageBox.Show("지웠어요.", AppPaths.ProductName, MessageBoxButton.OK, MessageBoxImage.Information);
    }
}
