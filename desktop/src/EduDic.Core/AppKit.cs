using DesktopKit;

namespace EduDic.Core;

/// <summary>
/// 설치·자동 업데이트 정보 (공용 모듈 LOCAL/local-desktop-kit — 0.6.0~, docs/plan-desktop-kit.md).
/// 설치 배치는 0.5.0 과 같다: %LOCALAPPDATA%\Programs\EduDic\versions\판\ + app\ 정션. 데이터는 %LOCALAPPDATA%\EduDic.
/// </summary>
public static class AppKit
{
    /// <summary>바로가기·제거 목록·시작 프로그램 값 이름 — 옛 판(Tauri 포함)과 같아야 이어진다</summary>
    public const string ProductName = "어린이 쉬운 사전 데스크탑";
    public const string ExeName = "어린이 쉬운 사전.exe";
    /// <summary>설치 파일 사본 이름 (설치 폴더 안, 제거·다시 설치용). 다리 기간엔 앱 팩에도 실린다</summary>
    public const string SetupName = "EduDic-Setup";
    /// <summary>떠 있는 앱을 끄는 신호 (단일 실행 코드가 만든다) — 설치 파일 빌드 속성 KitQuitEvent 와 같게</summary>
    public const string QuitEvent = "Local\\EduDicDesktop-Quit";

    public static readonly KitApp Info = new()
    {
        Id = "edu-dic",
        Name = ProductName,
        ExeName = ExeName,
        InstallDirName = "EduDic",
        ManifestUrl = "https://eduin.info/downloads/apps/edu-dic/latest.json",
        // 0.4.0 부터 쓰던 키 그대로 — 바꾸면 설치된 앱이 업데이트를 못 받는다. 개인키는 루트 .dev.vars 의 DESKTOP_UPDATER_ECDSA_KEY
        PublicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYSSRkmR7pDQiAjEocPEYPKHkUgMmaDAJ/35X7AWDvGXWx+JWE8p2+8mxnix3n5T7F8qFusBvHCmvz9DsV+vO1w==",
        SetupName = SetupName,
        Publisher = "dic.dgedu.link",
        Url = "https://dic.dgedu.link",
    };

    /// <summary>exe 폴더가 이 앱의 설치판인가 (versions\판\ 또는 app\ 정션, install.json 있음)</summary>
    public static bool IsInstalled(string exeDir) =>
        KitLayout.InstallRootOf(exeDir) is { } root && Same(root, Info.InstallDir);

    internal static bool Same(string a, string b) =>
        string.Equals(Path.GetFullPath(a).TrimEnd('\\'), Path.GetFullPath(b).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
}
