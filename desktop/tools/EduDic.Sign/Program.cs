using System.IO.Compression;
using System.Security.Cryptography;
using EduDic.Core;

// 업데이트 서명 도구 (tools/release.ps1 이 부른다). 개인키는 화면에 찍지 않는다.
//   keygen <.dev.vars>          키가 없으면 만들어 .dev.vars 에 DESKTOP_UPDATER_ECDSA_KEY 로 덧붙이고 공개키만 출력
//   pubkey <.dev.vars>          저장된 개인키의 공개키 출력
//   sign <.dev.vars> <exe> <버전>  {"sha256":…,"ecdsa":…} 출력 (공개키로 바로 검증까지) — 설치 프로그램용(0.4.x 앱이 읽음)
//   packs <.dev.vars> <게시 폴더> <출력 폴더> <버전> <주소 앞부분>  팩 zip 만들기 + {"packs":[…],"packsEcdsa":…} 출력
const string Name = "DESKTOP_UPDATER_ECDSA_KEY";

static string? ReadKey(string envPath)
{
    if (!File.Exists(envPath)) return null;
    foreach (var line in File.ReadAllLines(envPath))
    {
        var t = line.Trim();
        if (t.StartsWith(Name + "=", StringComparison.Ordinal)) return t[(Name.Length + 1)..].Trim().Trim('"');
    }
    return null;
}

static string PublicOf(string priv)
{
    using var ec = ECDsa.Create();
    ec.ImportPkcs8PrivateKey(Convert.FromBase64String(priv), out _);
    return Convert.ToBase64String(ec.ExportSubjectPublicKeyInfo());
}

if (args.Length < 2) { Console.Error.WriteLine("사용: keygen|pubkey|sign <.dev.vars> [exe 버전]"); return 2; }
var env = args[1];
switch (args[0])
{
    case "keygen":
    {
        var existing = ReadKey(env);
        if (existing != null) { Console.WriteLine(PublicOf(existing)); return 0; }
        var (priv, pub) = UpdateSignature.NewKey();
        var text = File.Exists(env) ? File.ReadAllText(env) : "";
        var nl = text.Length == 0 || text.EndsWith('\n') ? "" : Environment.NewLine;
        File.AppendAllText(env, $"{nl}{Environment.NewLine}# 데스크탑 앱 자동 업데이트 서명 개인키(ECDSA P-256, PKCS#8 base64) — 잃어버리면 설치된 앱이 더 이상 업데이트를 못 받는다{Environment.NewLine}{Name}={priv}{Environment.NewLine}");
        Console.WriteLine(pub);
        return 0;
    }
    case "pubkey":
    {
        var k = ReadKey(env);
        if (k == null) { Console.Error.WriteLine($"{env} 에 {Name} 가 없어요."); return 1; }
        Console.WriteLine(PublicOf(k));
        return 0;
    }
    case "sign":
    {
        if (args.Length < 4 || !AppVersion.TryParse(args[3], out var v)) { Console.Error.WriteLine("sign <.dev.vars> <exe> <버전>"); return 2; }
        var k = ReadKey(env);
        if (k == null) { Console.Error.WriteLine($"{env} 에 {Name} 가 없어요."); return 1; }
        var sha = UpdateSignature.Sha256Hex(args[2]);
        var sig = UpdateSignature.Sign(v, sha, k);
        if (!UpdateSignature.Verify(v, sha, sig)) { Console.Error.WriteLine("앱에 넣은 공개키와 개인키가 맞지 않아요 (Update.cs PublicKey 확인)."); return 1; }
        Console.WriteLine($"{{\"sha256\":\"{sha}\",\"ecdsa\":\"{sig}\"}}");
        return 0;
    }
    case "packs":
    {
        // packs <.dev.vars> <게시 폴더> <팩 출력 폴더> <버전> <팩 주소 앞부분>
        if (args.Length < 6 || !AppVersion.TryParse(args[4], out var v)) { Console.Error.WriteLine("packs <.dev.vars> <게시 폴더> <출력 폴더> <버전> <주소 앞부분>"); return 2; }
        var k = ReadKey(env);
        if (k == null) { Console.Error.WriteLine($"{env} 에 {Name} 가 없어요."); return 1; }
        var packs = PackBuilder.Build(args[2], args[3], args[5]);
        var version = AppVersion.Text(v);
        var sig = UpdateSignature.SignText(Packs.IndexText(version, packs), k);
        if (!Packs.Verify(Packs.IndexText(version, packs), sig)) { Console.Error.WriteLine("앱에 넣은 공개키와 개인키가 맞지 않아요 (Install.cs PublicKey 확인)."); return 1; }
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            packs = packs.Select(p => new { name = p.Name, sha256 = p.Sha256, size = p.Size, url = p.Url }),
            packsEcdsa = sig,
        });
        Console.WriteLine(json);
        return 0;
    }
    default:
        Console.Error.WriteLine("알 수 없는 명령");
        return 2;
}

/// <summary>게시 폴더 → 팩 zip (결정적: 이름순·시각 고정 — 내용이 같으면 해시도 같아 안 바뀐 팩은 다시 받지 않는다)</summary>
static class PackBuilder
{
    static readonly DateTimeOffset Fixed = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);

    static bool Skip(string rel) =>
        rel.EndsWith(".pdb", StringComparison.OrdinalIgnoreCase)
        || rel.EndsWith(".staticwebassets.endpoints.json", StringComparison.OrdinalIgnoreCase)
        || rel.StartsWith("wwwroot\\", StringComparison.OrdinalIgnoreCase) // 화면 파일은 앱 dll 안에 들어 있다
        || rel.Equals(Packs.RecordFile, StringComparison.OrdinalIgnoreCase)
        || (rel.EndsWith(".xml", StringComparison.OrdinalIgnoreCase) && !rel.Contains('\\')); // 라이브러리 설명 문서

    public static List<PackInfo> Build(string publishDir, string outDir, string urlBase)
    {
        Directory.CreateDirectory(outDir);
        var root = Path.GetFullPath(publishDir).TrimEnd('\\') + "\\";
        var files = Directory.GetFiles(root, "*", SearchOption.AllDirectories)
            .Select(f => f[root.Length..])
            .Where(r => !Skip(r))
            .OrderBy(r => r, StringComparer.Ordinal)
            .ToList();
        var result = new List<PackInfo>();
        foreach (var name in Packs.Names)
        {
            var mine = files.Where(r => Packs.Classify(r) == name).ToList();
            if (mine.Count == 0) continue;
            var tmp = Path.Combine(outDir, $"_{name}.zip");
            using (var fs = File.Create(tmp))
            using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
            {
                foreach (var rel in mine)
                {
                    var e = zip.CreateEntry(rel.Replace('\\', '/'), CompressionLevel.SmallestSize);
                    e.LastWriteTime = Fixed;
                    using var src = File.OpenRead(Path.Combine(root, rel));
                    using var dst = e.Open();
                    src.CopyTo(dst);
                }
            }
            var sha = Packs.Sha256Hex(tmp);
            var final = Path.Combine(outDir, sha + ".zip");
            File.Move(tmp, final, overwrite: true);
            result.Add(new PackInfo { Name = name, Sha256 = sha, Size = new FileInfo(final).Length, Url = urlBase + sha });
            Console.Error.WriteLine($"  {name}: 파일 {mine.Count}개, {new FileInfo(final).Length / 1048576.0:0.0} MB");
        }
        return result;
    }
}
