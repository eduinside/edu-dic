using DesktopKit;

namespace EduDic.Core;

/// <summary>
/// 다리 판(0.6.x) 동안만: 0.5.0 이 깐 배치(옛 설치 프로그램·옛 업데이터 — install.json·설치 파일 사본 없음)를 kit 배치로 받아들인다.
/// 파일만 다룬다 — 제거 정보·시작 프로그램·옛 Tauri 앱은 앱의 LegacyMigration. 옛 저장소를 비울 때 함께 지운다 (docs/plan-desktop-kit.md §2)
/// </summary>
public static class LegacyLayout
{
    /// <summary>
    /// exe 가 설치 폴더의 versions\판\ 안(또는 app\ 정션)에서 돌고 packs.txt 는 있는데 install.json 이 없으면 만든다(익명 설치 번호 포함).
    /// 만들었으면 true — 이 뒤로 KitUpdater 가 설치판으로 본다
    /// </summary>
    public static bool Adopt(KitApp app, string exeDir, string version)
    {
        if (File.Exists(app.InstallJson)) return false;
        var own = KitLayout.ResolveVersionDir(exeDir);
        if (Path.GetDirectoryName(own) is not { } parent || !AppKit.Same(parent, app.VersionsDir)) return false;
        if (!File.Exists(Path.Combine(own, KitPacks.RecordFile))) return false;
        KitLayout.WriteInstallJson(app, version);
        return true;
    }

    /// <summary>앱 팩에 실린 설치 파일(&lt;SetupName&gt;.exe)을 설치 폴더 사본 자리로 (사본이 없을 때만). 사본이 있으면 true</summary>
    public static bool PlaceSetupCopy(KitApp app, string exeDir)
    {
        if (File.Exists(app.SetupCopy)) return true;
        var bundled = Path.Combine(KitLayout.ResolveVersionDir(exeDir), app.SetupName + ".exe");
        if (!File.Exists(bundled)) return false;
        File.Copy(bundled, app.SetupCopy + ".tmp", true);
        File.Move(app.SetupCopy + ".tmp", app.SetupCopy, true);
        return true;
    }

    /// <summary>0.4.x 단일 exe 자리(설치 폴더 바로 아래 — 0.4.x 업데이터가 설치 파일을 여기 놓고 띄운다)와 그 .old·.new 를 지운다 (쓰는 중이면 다음에)</summary>
    public static void RemoveSingleExe(KitApp app)
    {
        var exe = Path.Combine(app.InstallDir, app.ExeName);
        foreach (var f in new[] { exe, exe + ".old", exe + ".new" })
            try { if (File.Exists(f)) File.Delete(f); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
    }
}
