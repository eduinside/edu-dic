using Microsoft.Win32;

namespace EduDic.App;

/// <summary>Windows 시작 시 실행 (HKCU Run). 값 이름은 옛 Tauri 앱과 같아서, 옛 등록이 있으면 그대로 이어 받는다.
/// kit 설치 파일의 제거도 이 이름(= 앱 Name)의 값을 지운다</summary>
public static class Autostart
{
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string ValueName = AppPaths.ProductName;

    /// <summary>등록된 명령 (없으면 null)</summary>
    public static string? Command
    {
        get
        {
            using var k = Registry.CurrentUser.OpenSubKey(RunKey);
            return k?.GetValue(ValueName) as string;
        }
    }

    public static bool IsEnabled => Command != null;

    public static string CommandFor(string exe) => $"\"{exe}\" --autostart";

    public static void Set(bool on, string exe)
    {
        using var k = Registry.CurrentUser.CreateSubKey(RunKey);
        if (on) k.SetValue(ValueName, CommandFor(exe));
        else if (k.GetValue(ValueName) != null) k.DeleteValue(ValueName, false);
    }
}
