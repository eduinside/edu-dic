using System.IO;
using EduDic.Core;

namespace EduDic.App;

/// <summary>설치·데이터 위치 (설치 배치는 Core.AppKit — 공용 모듈 DesktopKit)</summary>
public static class AppPaths
{
    public const string ProductName = AppKit.ProductName;
    public const string ExeName = AppKit.ExeName;
    public const string WebUrl = "https://dic.dgedu.link";

    static readonly string Local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    public static string CurrentExe => Environment.ProcessPath ?? "";
    public static string ExeDir => Path.GetDirectoryName(CurrentExe) ?? AppContext.BaseDirectory;

    /// <summary>설치판으로 실행 중인가 (자동 업데이트는 이때만) — 다리 판은 시작할 때 0.5.0 배치를 먼저 받아들인다(LegacyMigration)</summary>
    public static bool Installed => AppKit.IsInstalled(ExeDir);

    /// <summary>바로가기·시작 프로그램이 가리킬 exe: 설치판이면 app 정션 경로(판이 바뀌어도 그대로), 아니면 지금 exe</summary>
    public static string LaunchExe => Installed ? AppKit.Info.AppExe : CurrentExe;

    /// <summary>화면 엔진(WebView2)·설정 폴더 — 설치 폴더 밖. EDUDIC_DATA_DIR 로 바꿀 수 있다(시험용)</summary>
    public static string DataDir => Environment.GetEnvironmentVariable("EDUDIC_DATA_DIR") is { Length: > 0 } d ? d : Path.Combine(Local, "EduDic");
    public static string WebView => Path.Combine(DataDir, "webview");

    public static string Version
    {
        get
        {
            var v = typeof(AppPaths).Assembly.GetName().Version ?? new Version(0, 0, 0);
            return $"{v.Major}.{v.Minor}.{Math.Max(0, v.Build)}";
        }
    }
}
