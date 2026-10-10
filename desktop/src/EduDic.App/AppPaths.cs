using System.IO;

namespace EduDic.App;

/// <summary>설치·데이터 위치. 설치는 사용자 폴더라 관리자 권한이 필요 없다</summary>
public static class AppPaths
{
    public const string ProductName = "어린이 쉬운 사전 데스크탑";
    public const string ExeName = "어린이 쉬운 사전.exe";
    public const string WebUrl = "https://dic.dgedu.link";

    static readonly string Local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    public static string InstallDir => Path.Combine(Local, "Programs", "EduDic");
    public static string InstallExe => Path.Combine(InstallDir, ExeName);

    /// <summary>화면 엔진(WebView2) 폴더. EDUDIC_DATA_DIR 로 바꿀 수 있다(시험용)</summary>
    public static string DataDir => Environment.GetEnvironmentVariable("EDUDIC_DATA_DIR") is { Length: > 0 } d ? d : Path.Combine(Local, "EduDic");
    public static string WebView => Path.Combine(DataDir, "webview");

    public static string CurrentExe => Environment.ProcessPath ?? "";

    /// <summary>설치 폴더의 exe로 실행 중인가 (자동 업데이트는 이때만)</summary>
    public static bool RunningInstalled => string.Equals(Path.GetFullPath(CurrentExe), Path.GetFullPath(InstallExe), StringComparison.OrdinalIgnoreCase);

    public static string Version
    {
        get
        {
            var v = typeof(AppPaths).Assembly.GetName().Version ?? new Version(0, 0, 0);
            return Core.AppVersion.Text(v);
        }
    }
}
