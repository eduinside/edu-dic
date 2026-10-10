using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EduDic.Core;

/// <summary>
/// 자동 업데이트 매니페스트(R2 desktop-latest.json) 중 0.5.0+ 앱이 읽는 부분: 버전 · 팩 목록 · 팩 서명.
/// 같은 파일에 옛 Tauri 앱용(platforms·minisign)과 0.4.x 앱용(sha256·ecdsa) 필드도 함께 있고,
/// 둘 다 설치 프로그램을 가리킨다 (docs/plan-desktop-dotnet.md §3, §7).
/// </summary>
public sealed record UpdateManifest(Version Version, IReadOnlyList<PackInfo> Packs, string PacksSignature, string? Notes)
{
    /// <summary>팩 필드가 없거나 형식이 틀리면 null</summary>
    public static UpdateManifest? Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!AppVersion.TryParse(Str(root, "version"), out var version)) return null;
            var sig = Str(root, "packsEcdsa");
            if (sig == null || !root.TryGetProperty("packs", out var arr) || arr.ValueKind != JsonValueKind.Array) return null;
            var packs = new List<PackInfo>();
            foreach (var p in arr.EnumerateArray())
            {
                var name = Str(p, "name");
                var sha = Str(p, "sha256");
                var url = Str(p, "url");
                if (name == null || sha == null || sha.Length != 64 || url == null) return null;
                if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "https" && !u.IsLoopback)) return null;
                if (!p.TryGetProperty("size", out var s) || !s.TryGetInt64(out var size)) return null;
                packs.Add(new PackInfo { Name = name, Sha256 = sha.ToLowerInvariant(), Size = size, Url = url });
            }
            if (packs.Count == 0 || packs.Select(p => p.Name).Distinct().Count() != packs.Count) return null;
            return new(version, packs, sig, Str(root, "notes"));
        }
        catch (JsonException) { return null; }
    }

    /// <summary>팩 목록 서명이 앱에 넣어 둔 공개키로 맞는가</summary>
    public bool Verified(string publicKey = InstallLayout.PublicKey) =>
        Core.Packs.Verify(Core.Packs.IndexText(AppVersion.Text(Version), Packs), PacksSignature, publicKey);

    static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}

public static class AppVersion
{
    /// <summary>"0.4.1" · "v0.4.1" · "0.4.1+abc" → Version(0,4,1)</summary>
    public static bool TryParse(string? s, out Version version)
    {
        version = new Version(0, 0, 0);
        if (string.IsNullOrWhiteSpace(s)) return false;
        var t = s.Trim().TrimStart('v', 'V');
        var cut = t.IndexOfAny(['+', '-']);
        if (cut >= 0) t = t[..cut];
        if (!Version.TryParse(t, out var v) || v.Build < 0) return false;
        version = new Version(v.Major, v.Minor, v.Build);
        return true;
    }

    public static string Text(Version v) => $"{v.Major}.{v.Minor}.{Math.Max(0, v.Build)}";

    public static bool IsNewer(Version remote, Version current) =>
        remote > new Version(current.Major, current.Minor, Math.Max(0, current.Build));
}

/// <summary>
/// 서명 만들기(릴리스 도구용)와 0.4.x 형식 확인. 0.4.x 앱은 "edudic-desktop|버전|파일 SHA-256" 서명을 보고
/// 설치 프로그램을 받아 자기 자리에 넣는다 — 버전을 함께 묶어 옛 파일을 새 버전인 척 내미는 것도 막는다.
/// </summary>
public static class UpdateSignature
{
    public static string FileText(Version v, string sha256Hex) => $"edudic-desktop|{AppVersion.Text(v)}|{sha256Hex.ToLowerInvariant()}";

    public static string Sha256Hex(string path) => Core.Packs.Sha256Hex(path);

    public static bool Verify(Version v, string sha256Hex, string signatureBase64, string publicKeyBase64 = InstallLayout.PublicKey) =>
        Core.Packs.Verify(FileText(v, sha256Hex), signatureBase64, publicKeyBase64);

    public static string Sign(Version v, string sha256Hex, string privateKeyPkcs8Base64) => SignText(FileText(v, sha256Hex), privateKeyPkcs8Base64);

    public static string SignText(string text, string privateKeyPkcs8Base64)
    {
        using var ec = ECDsa.Create();
        ec.ImportPkcs8PrivateKey(Convert.FromBase64String(privateKeyPkcs8Base64), out _);
        return Convert.ToBase64String(ec.SignData(Encoding.UTF8.GetBytes(text), HashAlgorithmName.SHA256));
    }

    /// <summary>(개인키 PKCS#8, 공개키 SPKI) base64</summary>
    public static (string Private, string Public) NewKey()
    {
        using var ec = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return (Convert.ToBase64String(ec.ExportPkcs8PrivateKey()), Convert.ToBase64String(ec.ExportSubjectPublicKeyInfo()));
    }
}
