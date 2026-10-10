// 설치 프로그램(.NET Framework 4.8)과 앱(.NET 10)이 함께 쓰는 설치·변경분 업데이트 코드.
// 두 쪽에서 컴파일되므로 .NET Framework 4.8 에도 있는 API만 쓴다 (docs/plan-desktop-dotnet.md §7).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EduDic.Core;

/// <summary>설치 위치 (관리자 권한 없이 사용자 폴더)</summary>
public static class InstallLayout
{
    public const string ProductName = "어린이 쉬운 사전 데스크탑";
    public const string ExeName = "어린이 쉬운 사전.exe";
    public const string ManifestUrl = "https://dic.dgedu.link/api/download/desktop-latest.json";

    /// <summary>
    /// 앱 업데이트 서명 공개키 (SubjectPublicKeyInfo, base64). 개인키는 루트 .dev.vars 의 DESKTOP_UPDATER_ECDSA_KEY
    /// </summary>
    public const string PublicKey = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYSSRkmR7pDQiAjEocPEYPKHkUgMmaDAJ/35X7AWDvGXWx+JWE8p2+8mxnix3n5T7F8qFusBvHCmvz9DsV+vO1w==";

    public static string InstallDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "EduDic");
    /// <summary>현재 버전을 가리키는 정션 — 바로가기·시작 프로그램·제거 정보는 모두 여기</summary>
    public static string AppDir => Path.Combine(InstallDir, "app");
    public static string AppExe => Path.Combine(AppDir, ExeName);
    public static string VersionsDir => Path.Combine(InstallDir, "versions");
    public static string VersionDir(string version) => Path.Combine(VersionsDir, version);
    /// <summary>0.4.x 단일 exe 자리 (옮겨 온 뒤 지운다)</summary>
    public static string LegacyExe => Path.Combine(InstallDir, ExeName);

    /// <summary>시험용: EDUDIC_UPDATE_URL 로 매니페스트 주소를 바꿀 수 있다</summary>
    public static string EffectiveManifestUrl =>
        Environment.GetEnvironmentVariable("EDUDIC_UPDATE_URL") is { Length: > 0 } u ? u : ManifestUrl;

    /// <summary>app 정션을 target 으로 바꾼다 (정션은 관리자 권한이 필요 없다)</summary>
#if NET5_0_OR_GREATER
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public static void PointAppTo(string target)
    {
        var link = AppDir;
        if (Directory.Exists(link))
        {
            if ((File.GetAttributes(link) & FileAttributes.ReparsePoint) != 0) Directory.Delete(link); // 정션만 지움
            else Directory.Delete(link, true);
        }
        // cmd 의 mklink 대신 Windows API 로 직접 만든다 — 명령 프롬프트를 막아 둔 학교 PC·보안 프로그램에서
        // cmd 실행이 ‘액세스 거부’로 실패한 적이 있다 (2026-10-10 실기)
        Junction.Create(link, Path.GetFullPath(target));
        if (!File.Exists(Path.Combine(link, ExeName))) throw new IOException("앱 폴더 연결(정션)을 만들지 못했어요.");
    }

    /// <summary>NTFS 정션(마운트 지점) 만들기: 빈 폴더를 만들고 FSCTL_SET_REPARSE_POINT 로 대상을 적는다</summary>
    public static class Junction
    {
        const uint GENERIC_WRITE = 0x40000000, OPEN_EXISTING = 3;
        const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000, FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
        const uint FSCTL_SET_REPARSE_POINT = 0x000900A4, IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sa, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool DeviceIoControl(IntPtr h, uint code, byte[] inBuf, int inSize, IntPtr outBuf, int outSize, out int returned, IntPtr overlapped);
        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr h);

        public static void Create(string link, string target)
        {
            Directory.CreateDirectory(link);
            var subst = Encoding.Unicode.GetBytes(@"\??\" + target.TrimEnd('\\'));
            var print = Encoding.Unicode.GetBytes(target.TrimEnd('\\'));
            var pathBytes = subst.Length + 2 + print.Length + 2; // 각 이름 뒤에 널 문자
            var buf = new byte[8 + 8 + pathBytes];
            BitConverter.GetBytes(IO_REPARSE_TAG_MOUNT_POINT).CopyTo(buf, 0);
            BitConverter.GetBytes((ushort)(8 + pathBytes)).CopyTo(buf, 4);     // ReparseDataLength
            BitConverter.GetBytes((ushort)0).CopyTo(buf, 8);                   // SubstituteNameOffset
            BitConverter.GetBytes((ushort)subst.Length).CopyTo(buf, 10);       // SubstituteNameLength
            BitConverter.GetBytes((ushort)(subst.Length + 2)).CopyTo(buf, 12); // PrintNameOffset
            BitConverter.GetBytes((ushort)print.Length).CopyTo(buf, 14);       // PrintNameLength
            subst.CopyTo(buf, 16);
            print.CopyTo(buf, 16 + subst.Length + 2);

            var h = CreateFileW(link, GENERIC_WRITE, 0, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
            if (h == new IntPtr(-1)) throw new IOException($"앱 폴더 연결을 만들지 못했어요 (열기 {Marshal.GetLastWin32Error()}).");
            try
            {
                if (!DeviceIoControl(h, FSCTL_SET_REPARSE_POINT, buf, buf.Length, IntPtr.Zero, 0, out _, IntPtr.Zero))
                    throw new IOException($"앱 폴더 연결을 만들지 못했어요 ({Marshal.GetLastWin32Error()}).");
            }
            finally { CloseHandle(h); }
        }
    }

    /// <summary>떠 있는 앱(0.4.x 포함 — 같은 이름)을 끄고 끝날 때까지 기다린다. 떠 있지 않았으면 바로 true</summary>
#if NET5_0_OR_GREATER
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
    public static bool QuitRunning(TimeSpan timeout)
    {
        const string Base = "Local\\EduDicDesktop";
        if (!Mutex.TryOpenExisting(Base, out var m)) return true;
        using (m)
        {
            if (EventWaitHandle.TryOpenExisting(Base + "-Quit", out var q)) using (q) q.Set();
            try { if (!m.WaitOne(timeout)) return false; m.ReleaseMutex(); return true; }
            catch (AbandonedMutexException) { return true; }
        }
    }
}

public sealed class PackInfo
{
    public string Name = "";
    public string Sha256 = "";
    public long Size;
    public string Url = "";
}

/// <summary>
/// 팩 단위 설치: 바뀐 팩만 내려받고, 안 바뀐 팩은 지금 버전 폴더에서 하드 링크(안 되면 복사)로 가져온다.
/// 각 버전 폴더의 packs.txt 에 "@이름 해시 크기" 다음 줄부터 그 팩의 파일 경로를 적어 둔다.
/// </summary>
public static class Packs
{
    public const string RecordFile = "packs.txt";
    public static readonly string[] Names = { "app", "runtime", "web" };

    /// <summary>파일이 어느 팩에 드는지 (게시 폴더 기준 상대 경로)</summary>
    public static string Classify(string relativePath)
    {
        var name = Path.GetFileName(relativePath);
        if (name.StartsWith("어린이 쉬운 사전", StringComparison.Ordinal) || name.StartsWith("EduDic.", StringComparison.Ordinal)) return "app";
        string[] web = { "Microsoft.AspNetCore.", "Microsoft.Extensions.", "Microsoft.JSInterop", "Microsoft.Web.WebView2.", "WebView2Loader" };
        return web.Any(w => name.StartsWith(w, StringComparison.OrdinalIgnoreCase)) ? "web" : "runtime";
    }

    /// <summary>서명 대상: "edudic-packs|버전|이름:해시:크기;…" (이름순)</summary>
    public static string IndexText(string version, IEnumerable<PackInfo> packs) =>
        "edudic-packs|" + version + "|" + string.Join(";", packs.OrderBy(p => p.Name, StringComparer.Ordinal)
            .Select(p => p.Name + ":" + p.Sha256.ToLowerInvariant() + ":" + p.Size));

    public static string Sha256Hex(Stream s)
    {
        using (var h = SHA256.Create()) return Hex(h.ComputeHash(s));
    }

    public static string Sha256Hex(string path)
    {
        using (var f = File.OpenRead(path)) return Sha256Hex(f);
    }

    static string Hex(byte[] b)
    {
        var sb = new StringBuilder(b.Length * 2);
        foreach (var x in b) sb.Append(x.ToString("x2"));
        return sb.ToString();
    }

    /// <summary>ECDSA P-256 서명 확인. 공개키는 SPKI(91바이트) — .NET Framework 엔 SPKI 가져오기가 없어 좌표를 직접 꺼낸다</summary>
    public static bool Verify(string text, string signatureBase64, string spkiBase64 = InstallLayout.PublicKey)
    {
        try
        {
            var spki = Convert.FromBase64String(spkiBase64);
            if (spki.Length != 91 || spki[26] != 4) return false;
            var x = new byte[32];
            var y = new byte[32];
            Buffer.BlockCopy(spki, 27, x, 0, 32);
            Buffer.BlockCopy(spki, 59, y, 0, 32);
            using (var ec = ECDsa.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new ECPoint { X = x, Y = y } }))
                return ec.VerifyData(Encoding.UTF8.GetBytes(text), Convert.FromBase64String(signatureBase64), HashAlgorithmName.SHA256);
        }
        catch (Exception e) when (e is FormatException || e is CryptographicException || e is ArgumentException)
        {
            return false;
        }
    }

    public sealed class Installed
    {
        public PackInfo Info = new PackInfo();
        public List<string> Files = new List<string>();
    }

    /// <summary>버전 폴더의 packs.txt 읽기. 없거나 깨졌으면 빈 목록</summary>
    public static Dictionary<string, Installed> ReadRecord(string? dir)
    {
        var map = new Dictionary<string, Installed>(StringComparer.Ordinal);
        if (dir == null) return map;
        var path = Path.Combine(dir, RecordFile);
        if (!File.Exists(path)) return map;
        Installed? cur = null;
        foreach (var line in File.ReadAllLines(path, Encoding.UTF8))
        {
            if (line.Length == 0) continue;
            if (line[0] == '@')
            {
                var parts = line.Substring(1).Split(' ');
                if (parts.Length != 3 || !long.TryParse(parts[2], out var size)) return new Dictionary<string, Installed>();
                cur = new Installed { Info = new PackInfo { Name = parts[0], Sha256 = parts[1], Size = size } };
                map[parts[0]] = cur;
            }
            else cur?.Files.Add(line);
        }
        return map;
    }

    /// <summary>
    /// newDir 에 버전 폴더를 만든다. 내려받은 팩은 해시를 확인하고, 하나라도 틀리면 예외 (반쯤 만든 폴더는 남기지 않음).
    /// download(팩, 저장할 zip 경로) 는 내려받기만 하면 된다. 내려받은 바이트 수를 돌려준다
    /// </summary>
    public static async Task<long> BuildAsync(string newDir, IList<PackInfo> packs, string? currentDir, Func<PackInfo, string, Task> download)
    {
        var current = ReadRecord(currentDir);
        var tmp = newDir + ".tmp";
        if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
        Directory.CreateDirectory(tmp);
        long downloaded = 0;
        try
        {
            var record = new StringBuilder();
            foreach (var pack in packs)
            {
                List<string> files;
                if (currentDir != null && current.TryGetValue(pack.Name, out var have)
                    && string.Equals(have.Info.Sha256, pack.Sha256, StringComparison.OrdinalIgnoreCase)
                    && have.Files.All(f => File.Exists(Path.Combine(currentDir, f))))
                {
                    foreach (var f in have.Files) LinkOrCopy(Path.Combine(currentDir, f), Path.Combine(tmp, f));
                    files = have.Files;
                }
                else
                {
                    var zip = Path.Combine(tmp, "_" + pack.Name + ".zip");
                    await download(pack, zip).ConfigureAwait(false);
                    var sha = Sha256Hex(zip);
                    if (!string.Equals(sha, pack.Sha256, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException($"내려받은 '{pack.Name}' 꾸러미가 손상됐어요. 다시 시도해 주세요.");
                    downloaded += new FileInfo(zip).Length;
                    files = Extract(zip, tmp);
                    File.Delete(zip);
                }
                record.Append('@').Append(pack.Name).Append(' ').Append(pack.Sha256.ToLowerInvariant()).Append(' ').Append(pack.Size).Append('\n');
                foreach (var f in files) record.Append(f).Append('\n');
            }
            File.WriteAllText(Path.Combine(tmp, RecordFile), record.ToString(), new UTF8Encoding(false));
            if (Directory.Exists(newDir)) Directory.Delete(newDir, true);
            Directory.Move(tmp, newDir);
            return downloaded;
        }
        catch
        {
            try { Directory.Delete(tmp, true); } catch (Exception) { }
            throw;
        }
    }

    /// <summary>zip 을 dir 에 풀고 상대 경로 목록을 돌려준다 (상위 폴더로 나가는 경로는 거부)</summary>
    static List<string> Extract(string zip, string dir)
    {
        var root = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
        var files = new List<string>();
        using (var z = ZipFile.OpenRead(zip))
        {
            foreach (var e in z.Entries)
            {
                if (e.FullName.EndsWith("/", StringComparison.Ordinal)) continue;
                var rel = e.FullName.Replace('/', '\\');
                var dest = Path.GetFullPath(Path.Combine(dir, rel));
                if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("꾸러미에 잘못된 경로가 있어요.");
                Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                e.ExtractToFile(dest, true);
                files.Add(rel);
            }
        }
        return files;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateHardLink(string lpFileName, string lpExistingFileName, IntPtr lpSecurityAttributes);

    static void LinkOrCopy(string from, string to)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(to)!);
        if (File.Exists(to)) File.Delete(to);
        if (!CreateHardLink(to, from, IntPtr.Zero)) File.Copy(from, to);
    }
}
