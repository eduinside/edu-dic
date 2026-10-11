using DesktopKit;

namespace EduDic.Sign;

/// <summary>
/// 옛 매니페스트(desktop-latest.json)의 서명 글 — 0.4.x·0.5.0 앱이 확인하는 형식 그대로 (옛 EduDic.Core Install.cs·Update.cs, 커밋 06f619d).
/// 서명은 kit 와 같은 ECDSA P-256 · 같은 키(DESKTOP_UPDATER_ECDSA_KEY)
/// </summary>
public static class Legacy
{
    /// <summary>0.5.0 앱: "edudic-packs|판|이름:sha:크기;…" (이름 서수 순)</summary>
    public static string PacksText(string version, IEnumerable<KitPack> packs) =>
        "edudic-packs|" + version + "|" + string.Join(";", packs.OrderBy(p => p.Name, StringComparer.Ordinal)
            .Select(p => p.Name + ":" + p.Sha256.ToLowerInvariant() + ":" + p.Size));

    /// <summary>0.4.x 앱: "edudic-desktop|판|설치 파일 sha" — 받은 설치 파일을 자기 자리에 놓고 실행한다</summary>
    public static string FileText(string version, string sha256Hex) => $"edudic-desktop|{version}|{sha256Hex.ToLowerInvariant()}";

    /// <summary>kit latest.json + 설치 파일 → 옛 매니페스트 (모든 서명을 공개키로 다시 확인)</summary>
    public static string Manifest(KitManifest m, string setupPath, string privateKey, string publicKey, string packBase, string downloadUrl, string minisign)
    {
        var setupSha = KitSign.Sha256Hex(setupPath);
        if (m.Files.Setup is not { } s || !string.Equals(s.Sha256, setupSha, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("설치 파일이 latest.json 과 달라요.");
        var packsText = PacksText(m.Version, m.Packs);
        var fileText = FileText(m.Version, setupSha);
        var packsSig = KitSign.Sign(packsText, privateKey);
        var fileSig = KitSign.Sign(fileText, privateKey);
        if (!KitSign.Verify(packsText, packsSig, publicKey) || !KitSign.Verify(fileText, fileSig, publicKey))
            throw new InvalidDataException("앱에 넣은 공개키와 개인키가 맞지 않아요.");
        var doc = new Dictionary<string, object?>
        {
            ["version"] = m.Version,
            ["notes"] = m.Notes.Count > 0 ? string.Join(" · ", m.Notes) : m.Version + " 버전",
            ["pub_date"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            // 옛 Tauri 앱(0.3.0 이하): minisign 으로 확인하고 설치 파일을 실행
            ["platforms"] = new Dictionary<string, object> { ["windows-x86_64"] = new Dictionary<string, string> { ["signature"] = minisign, ["url"] = downloadUrl } },
            // 0.4.x 앱: 설치 파일
            ["sha256"] = setupSha,
            ["ecdsa"] = fileSig,
            // 0.5.0 앱: 바뀐 팩만 (같은 zip 을 옛 저장소 desktop-packs/<sha>.zip 에도 올린다)
            ["packs"] = m.Packs.OrderBy(p => p.Name, StringComparer.Ordinal)
                .Select(p => new Dictionary<string, object> { ["name"] = p.Name, ["sha256"] = p.Sha256.ToLowerInvariant(), ["size"] = p.Size, ["url"] = packBase + p.Sha256.ToLowerInvariant() }).ToList(),
            ["packsEcdsa"] = packsSig,
        };
        return System.Text.Json.JsonSerializer.Serialize(doc, new System.Text.Json.JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
    }
}
