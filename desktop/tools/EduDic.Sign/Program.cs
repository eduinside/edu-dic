using System.Security.Cryptography;
using EduDic.Core;

// 업데이트 서명 도구 (tools/release.ps1 이 부른다). 개인키는 화면에 찍지 않는다.
//   keygen <.dev.vars>          키가 없으면 만들어 .dev.vars 에 DESKTOP_UPDATER_ECDSA_KEY 로 덧붙이고 공개키만 출력
//   pubkey <.dev.vars>          저장된 개인키의 공개키 출력
//   sign <.dev.vars> <exe> <버전>  {"sha256":…,"ecdsa":…} 출력 (공개키로 바로 검증까지)
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
    default:
        Console.Error.WriteLine("알 수 없는 명령");
        return 2;
}
