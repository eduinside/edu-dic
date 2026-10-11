using System.Diagnostics;
using System.IO;
using EduDic.Core;
using Microsoft.Win32;

namespace EduDic.App;

/// <summary>
/// 다리 판(0.6.x) 동안만: 옛 판에서 넘어온 설치를 kit 방식으로 마저 옮긴다 (docs/plan-desktop-kit.md §2). 시작할 때 KitUpdater 보다 먼저.
/// - 0.5.0(옛 업데이터가 팩으로 깐 0.6.0): install.json · 설치 파일 사본 · 제거 정보(EduDicDesktop → edu-dic)
/// - 0.4.x: 설치 폴더 바로 아래 단일 exe(사실은 그 업데이터가 띄운 설치 파일) 지우기
/// - Tauri 0.3.0 이하: 옛 앱을 제거 프로그램으로 지우고 바로가기·시작 프로그램을 새 경로로
/// 옛 저장소(edu-dic-downloads)를 비울 때 이 파일·Core.LegacyLayout·앱 팩의 설치 파일 사본을 함께 지운다.
/// </summary>
public static class LegacyMigration
{
    const string UninstallRoot = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    const string OldKey = "EduDicDesktop"; // 0.4.0~0.5.0
    const string TauriProcess = "edu-dic-desktop";

    static string StartMenuLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppPaths.ProductName + ".lnk");
    static string DesktopLink => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppPaths.ProductName + ".lnk");

    public static void Run()
    {
        var app = AppKit.Info;
        try { LegacyLayout.Adopt(app, AppPaths.ExeDir, AppPaths.Version); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return; }
        if (!AppPaths.Installed) return; // 개발 실행·포터블

        try { if (LegacyLayout.PlaceSetupCopy(app, AppPaths.ExeDir)) MoveUninstallInfo(); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        LegacyLayout.RemoveSingleExe(app);
        try
        {
            // 0.4.x(설치 폴더 바로 아래 exe)·Tauri·버전 폴더를 가리키던 시작 프로그램 등록을 app 정션으로
            if (Autostart.Command is { } cmd && cmd != Autostart.CommandFor(app.AppExe)) Autostart.Set(true, app.AppExe);
        }
        catch (Exception) { /* 레지스트리 막힘 */ }
        if (TauriEntries().Count > 0) _ = Task.Run(RemoveTauriApp);
    }

    /// <summary>0.5.0 의 제거 정보(앱 exe --uninstall)를 kit 것(설치 파일 사본 --uninstall)으로 — kit 설치 파일이 쓰는 값과 같게</summary>
    static void MoveUninstallInfo()
    {
        using var old = Registry.CurrentUser.OpenSubKey($@"{UninstallRoot}\{OldKey}");
        if (old == null) return;
        var app = AppKit.Info;
        using (var k = Registry.CurrentUser.CreateSubKey(app.UninstallKey))
        {
            k.SetValue("DisplayName", app.Name);
            k.SetValue("DisplayVersion", AppPaths.Version);
            k.SetValue("DisplayIcon", app.AppExe + ",0");
            k.SetValue("Publisher", app.Publisher);
            k.SetValue("URLInfoAbout", app.Url);
            k.SetValue("InstallLocation", app.InstallDir);
            k.SetValue("UninstallString", $"\"{app.SetupCopy}\" --uninstall");
            k.SetValue("QuietUninstallString", $"\"{app.SetupCopy}\" --uninstall --quiet");
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            if (old.GetValue("EstimatedSize") is int size) k.SetValue("EstimatedSize", size, RegistryValueKind.DWord);
        }
        Registry.CurrentUser.DeleteSubKeyTree($@"{UninstallRoot}\{OldKey}", throwOnMissingSubKey: false);
    }

    /// <summary>옛 Tauri(NSIS) 설치본의 제거 정보 키 이름들</summary>
    static List<string> TauriEntries()
    {
        var found = new List<string>();
        try
        {
            using var root = Registry.CurrentUser.OpenSubKey(UninstallRoot);
            if (root == null) return found;
            foreach (var name in root.GetSubKeyNames())
            {
                if (name == OldKey || name == AppKit.Info.Id) continue;
                using var k = root.OpenSubKey(name);
                if (k?.GetValue("DisplayName") is string dn && dn.StartsWith("어린이 쉬운 사전", StringComparison.Ordinal) && k.GetValue("UninstallString") is string)
                    found.Add(name);
            }
        }
        catch (Exception) { }
        return found;
    }

    /// <summary>옛 Tauri 앱을 제거 프로그램으로 조용히 지운다. 같은 이름의 바로가기·시작 프로그램을 지우므로 끝난 뒤 새 경로로 다시 만든다</summary>
    static void RemoveTauriApp()
    {
        foreach (var p in Process.GetProcessesByName(TauriProcess))
            using (p) { try { p.Kill(); p.WaitForExit(5000); } catch (Exception) { } }
        var autostart = Autostart.IsEnabled;
        var hadDesktopLink = File.Exists(DesktopLink);
        var removed = false;
        foreach (var name in TauriEntries())
        {
            try
            {
                using var k = Registry.CurrentUser.OpenSubKey($@"{UninstallRoot}\{name}");
                var exe = (k?.GetValue("UninstallString") as string)?.Trim().Trim('"');
                if (exe == null || !File.Exists(exe)) continue;
                using var p = Process.Start(new ProcessStartInfo(exe, "/S") { UseShellExecute = false, CreateNoWindow = true });
                p?.WaitForExit(60_000);
                // NSIS 제거 프로그램은 임시 폴더로 자신을 복사해 다시 띄우고 바로 끝난다 — 제거 정보가 사라질 때까지 기다린다.
                // 안 기다리면 늦게 도는 옛 제거가 같은 이름의 새 바로가기를 지워 버린다 (2026-10-10 실기)
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
            catch (Exception) { /* 다음에 켤 때 다시 */ }
        }
        if (!removed) return;
        CreateShortcut(StartMenuLink);
        if (hadDesktopLink) CreateShortcut(DesktopLink);
        try { if (autostart) Autostart.Set(true, AppKit.Info.AppExe); } catch (Exception) { }
    }

    static void CreateShortcut(string lnkPath)
    {
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return;
            dynamic shell = Activator.CreateInstance(type)!;
            var lnk = shell.CreateShortcut(lnkPath);
            lnk.TargetPath = AppKit.Info.AppExe;
            lnk.WorkingDirectory = AppKit.Info.AppDir;
            lnk.IconLocation = AppKit.Info.AppExe + ",0";
            lnk.Description = AppKit.Info.Name;
            lnk.Save();
        }
        catch (Exception) { /* 바로가기는 편의 기능 */ }
    }
}
