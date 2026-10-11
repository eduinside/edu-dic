using System.IO;
using System.Text.Json;

namespace EduDic.App;

/// <summary>앱 설정 — %LOCALAPPDATA%\EduDic\settings.json (설치 폴더 밖이라 업데이트·다시 설치해도 남는다)</summary>
public sealed class Settings
{
    /// <summary>사용 통계(익명 설치 번호)를 업데이트 확인 때 함께 보낼지 — 이용 안내(terms.txt), 트레이 메뉴에서 끈다</summary>
    public bool UsageStats { get; set; } = true;

    static string FilePath => Path.Combine(AppPaths.DataDir, "settings.json");
    static readonly JsonSerializerOptions Opts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    public static Settings Load()
    {
        try { return File.Exists(FilePath) ? JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath), Opts) ?? new() : new(); }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { return new(); }
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(AppPaths.DataDir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, Opts));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { /* 설정 저장은 다음에 */ }
    }
}
