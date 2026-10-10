using System.IO;
using EduDic.Core;

namespace EduDic.App;

/// <summary>설치·데이터 위치 (설치 배치는 Core.InstallLayout — 설치 프로그램과 함께 쓴다)</summary>
public static class AppPaths
{
    public const string ProductName = InstallLayout.ProductName;
    public const string ExeName = InstallLayout.ExeName;
    public const string WebUrl = "https://dic.dgedu.link";

    static readonly string Local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    public static string InstallDir => InstallLayout.InstallDir;
    /// <summary>바로가기·시작 프로그램이 가리키는 고정 경로 (app 정션 → 현재 버전 폴더)</summary>
    public static string InstallExe => InstallLayout.AppExe;
    /// <summary>이 프로세스가 실행된 버전 폴더</summary>
    public static string OwnVersionDir => InstallLayout.VersionDir(Version);

    /// <summary>화면 엔진(WebView2) 폴더. EDUDIC_DATA_DIR 로 바꿀 수 있다(시험용)</summary>
    public static string DataDir => Environment.GetEnvironmentVariable("EDUDIC_DATA_DIR") is { Length: > 0 } d ? d : Path.Combine(Local, "EduDic");
    public static string WebView => Path.Combine(DataDir, "webview");

    public static string CurrentExe => Environment.ProcessPath ?? "";

    /// <summary>설치된 앱으로 실행 중인가 (자동 업데이트는 이때만): 설치 폴더 안의 버전 폴더에서 떴을 때</summary>
    public static bool RunningInstalled =>
        Path.GetFullPath(AppContext.BaseDirectory).StartsWith(Path.GetFullPath(InstallDir) + "\\", StringComparison.OrdinalIgnoreCase)
        && File.Exists(Path.Combine(OwnVersionDir, Packs.RecordFile));

    public static string Version
    {
        get
        {
            var v = typeof(AppPaths).Assembly.GetName().Version ?? new Version(0, 0, 0);
            return AppVersion.Text(v);
        }
    }
}
