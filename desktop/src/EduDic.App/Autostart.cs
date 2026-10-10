using Microsoft.Win32;

namespace EduDic.App;

/// <summary>Windows 시작 시 실행 (HKCU Run). 값 이름은 옛 Tauri 앱과 같아서, 옛 등록이 있으면 그대로 이어 받는다</summary>
public static class Autostart
{
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string ValueName = AppPaths.ProductName;

    public static bool IsEnabled
    {
        get
        {
            using var k = Registry.CurrentUser.OpenSubKey(RunKey);
            return k?.GetValue(ValueName) is string;
        }
    }

    public static void Set(bool on, string exe)
    {
        using var k = Registry.CurrentUser.CreateSubKey(RunKey);
        if (on) k.SetValue(ValueName, $"\"{exe}\" --autostart");
        else if (k.GetValue(ValueName) != null) k.DeleteValue(ValueName, false);
    }
}
