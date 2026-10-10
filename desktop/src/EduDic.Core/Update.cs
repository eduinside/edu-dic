using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EduDic.Core;

/// <summary>
/// 자동 업데이트 매니페스트(R2 desktop-latest.json). 옛 Tauri 앱도 같은 파일을 읽으므로
/// Tauri 필드(version·platforms)는 그대로 두고 새 앱용 sha256·ecdsa 를 덧붙인다 (docs/plan-desktop-dotnet.md §3).
/// </summary>
public sealed record UpdateManifest(Version Version, string Url, string Sha256, string Signature, string? Notes)
{
    public const string ManifestUrl = DictClient.DefaultBase + "/api/download/desktop-latest.json";
    public const string Platform = "windows-x86_64";

    /// <summary>새 앱용 필드가 없거나 형식이 틀리면 null (옛 Tauri 전용 매니페스트)</summary>
    public static UpdateManifest? Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!AppVersion.TryParse(Str(root, "version"), out var version)) return null;
            var url = root.TryGetProperty("platforms", out var p) && p.TryGetProperty(Platform, out var w) ? Str(w, "url") : null;
            var sha = Str(root, "sha256");
            var sig = Str(root, "ecdsa");
            if (url == null || sha == null || sig == null || sha.Length != 64) return null;
            if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != "https") return null;
            return new(version, url, sha.ToLowerInvariant(), sig, Str(root, "notes"));
        }
        catch (JsonException) { return null; }
    }

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
/// 업데이트 서명: ECDSA P-256(SHA-256). 서명 대상은 "edudic-desktop|버전|파일 SHA-256" —
/// 버전을 함께 묶어서, 예전 버전 파일을 새 버전인 척 다시 내미는 것(되돌리기)도 막는다.
/// </summary>
public static class UpdateSignature
{
    /// <summary>앱에 넣어 둔 공개키 (SubjectPublicKeyInfo, base64). 개인키는 루트 .dev.vars 의 DESKTOP_UPDATER_ECDSA_KEY</summary>
    public const string PublicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYSSRkmR7pDQiAjEocPEYPKHkUgMmaDAJ/35X7AWDvGXWx+JWE8p2+8mxnix3n5T7F8qFusBvHCmvz9DsV+vO1w==";

    static byte[] Payload(Version v, string sha256Hex) =>
        Encoding.UTF8.GetBytes($"edudic-desktop|{AppVersion.Text(v)}|{sha256Hex.ToLowerInvariant()}");

    public static string Sha256Hex(Stream s) => Convert.ToHexStringLower(SHA256.HashData(s));

    public static string Sha256Hex(string path)
    {
        using var f = File.OpenRead(path);
        return Sha256Hex(f);
    }

    public static bool Verify(Version v, string sha256Hex, string signatureBase64, string publicKeyBase64 = PublicKey)
    {
        try
        {
            using var ec = ECDsa.Create();
            ec.ImportSubjectPublicKeyInfo(Convert.FromBase64String(publicKeyBase64), out _);
            return ec.VerifyData(Payload(v, sha256Hex), Convert.FromBase64String(signatureBase64), HashAlgorithmName.SHA256);
        }
        catch (Exception e) when (e is FormatException or CryptographicException) { return false; }
    }

    public static string Sign(Version v, string sha256Hex, string privateKeyPkcs8Base64)
    {
        using var ec = ECDsa.Create();
        ec.ImportPkcs8PrivateKey(Convert.FromBase64String(privateKeyPkcs8Base64), out _);
        return Convert.ToBase64String(ec.SignData(Payload(v, sha256Hex), HashAlgorithmName.SHA256));
    }

    /// <summary>(개인키 PKCS#8, 공개키 SPKI) base64</summary>
    public static (string Private, string Public) NewKey()
    {
        using var ec = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return (Convert.ToBase64String(ec.ExportPkcs8PrivateKey()), Convert.ToBase64String(ec.ExportSubjectPublicKeyInfo()));
    }
}
