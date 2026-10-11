using DesktopKit;
using EduDic.Core;
using EduDic.Sign;

// 다리 판 도구 (tools/release.ps1 -Bridge 가 부른다). 개인키는 화면에 찍지 않는다.
//   legacy <.dev.vars> <kit latest.json> <설치 파일 exe> <출력 desktop-latest.json> <팩 주소 앞부분> <설치 파일 주소> [minisign]
const string KeyName = "DESKTOP_UPDATER_ECDSA_KEY";

if (args.Length < 7 || args[0] != "legacy")
{
    Console.Error.WriteLine("사용: legacy <.dev.vars> <latest.json> <설치 파일> <출력> <팩 주소 앞부분> <설치 파일 주소> [minisign]");
    return 2;
}
var key = File.Exists(args[1]) ? File.ReadAllLines(args[1]).Select(l => l.Trim()).Where(l => l.StartsWith(KeyName + "=", StringComparison.Ordinal))
    .Select(l => l[(KeyName.Length + 1)..].Trim().Trim('"')).FirstOrDefault() : null;
if (key == null) { Console.Error.WriteLine($"{args[1]} 에 {KeyName} 가 없어요."); return 1; }
var m = KitManifest.Parse(File.ReadAllText(args[2]));
if (m == null || m.Check(AppKit.Info.Id, AppKit.Info.PublicKey) is { } why) { Console.Error.WriteLine("latest.json 확인 실패"); return 1; }
try
{
    File.WriteAllText(args[4], Legacy.Manifest(m, args[3], key, AppKit.Info.PublicKey, args[5], args[6], args.Length > 7 ? args[7] : ""), new System.Text.UTF8Encoding(false));
}
catch (InvalidDataException e) { Console.Error.WriteLine(e.Message); return 1; }
Console.WriteLine(args[4]);
return 0;
