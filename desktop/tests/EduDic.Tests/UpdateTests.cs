using System.IO.Compression;
using System.Text.Json;
using EduDic.Core;

namespace EduDic.Tests;

public class UpdateTests
{
    [Theory]
    [InlineData("0.4.1", "0.4.0", true)]
    [InlineData("0.4.0", "0.4.0", false)]
    [InlineData("0.3.9", "0.4.0", false)]
    [InlineData("v1.0.0", "0.9.12", true)]
    [InlineData("0.4.10", "0.4.9", true)]
    public void 버전_비교(string remote, string current, bool newer)
    {
        Assert.True(AppVersion.TryParse(remote, out var r));
        Assert.True(AppVersion.TryParse(current, out var c));
        Assert.Equal(newer, AppVersion.IsNewer(r, c));
    }

    [Fact]
    public void 설치프로그램_서명_왕복과_변조_거부()
    {
        var (priv, pub) = UpdateSignature.NewKey();
        var v = new Version(0, 4, 1);
        var sha = new string('a', 64);
        var sig = UpdateSignature.Sign(v, sha, priv);
        Assert.True(UpdateSignature.Verify(v, sha, sig, pub));
        Assert.False(UpdateSignature.Verify(v, new string('b', 64), sig, pub)); // 파일이 바뀜
        Assert.False(UpdateSignature.Verify(new Version(0, 4, 2), sha, sig, pub)); // 버전을 바꿔 다시 내밈
        Assert.False(UpdateSignature.Verify(v, sha, sig)); // 다른 키(앱에 넣은 키)
        Assert.False(UpdateSignature.Verify(v, sha, "깨진값", pub));
    }

    static List<PackInfo> SamplePacks() =>
    [
        new() { Name = "runtime", Sha256 = new string('b', 64), Size = 70_000_000, Url = "https://dic.dgedu.link/api/download/pack/" + new string('b', 64) },
        new() { Name = "app", Sha256 = new string('a', 64), Size = 1_200_000, Url = "https://dic.dgedu.link/api/download/pack/" + new string('a', 64) },
    ];

    [Fact]
    public void 팩_목록_서명은_이름순이고_해시_크기까지_묶는다()
    {
        var (priv, pub) = UpdateSignature.NewKey();
        var packs = SamplePacks();
        Assert.Equal($"edudic-packs|0.5.0|app:{new string('a', 64)}:1200000;runtime:{new string('b', 64)}:70000000", Packs.IndexText("0.5.0", packs));
        var sig = UpdateSignature.SignText(Packs.IndexText("0.5.0", packs), priv);
        Assert.True(Packs.Verify(Packs.IndexText("0.5.0", packs), sig, pub)); // .NET Framework 와 같은 좌표 방식으로 확인
        packs[1].Size++;
        Assert.False(Packs.Verify(Packs.IndexText("0.5.0", packs), sig, pub));
        Assert.False(Packs.Verify(Packs.IndexText("0.5.1", SamplePacks()), sig, pub));
    }

    [Fact]
    public void 매니페스트_팩_필드()
    {
        var (priv, pub) = UpdateSignature.NewKey();
        var packs = SamplePacks();
        var sig = UpdateSignature.SignText(Packs.IndexText("0.5.0", packs), priv);
        var json = JsonSerializer.Serialize(new
        {
            version = "0.5.0",
            notes = "고침",
            pub_date = "2026-10-10T00:00:00Z",
            platforms = new Dictionary<string, object> { ["windows-x86_64"] = new { signature = "minisign", url = "https://dic.dgedu.link/api/download/desktop" } },
            sha256 = new string('c', 64),
            ecdsa = "c2ln",
            packs = packs.Select(p => new { name = p.Name, sha256 = p.Sha256, size = p.Size, url = p.Url }),
            packsEcdsa = sig,
        });
        var m = UpdateManifest.Parse(json)!;
        Assert.Equal(new Version(0, 5, 0), m.Version);
        Assert.Equal(2, m.Packs.Count);
        Assert.True(m.Verified(pub));
        Assert.False(m.Verified()); // 앱에 넣은 키와 다른 키로 서명

        // 0.4.x 형식(팩 없음)·http 주소·이상한 값은 받지 않는다
        Assert.Null(UpdateManifest.Parse("""{"version":"0.4.2","sha256":"x","ecdsa":"y","platforms":{}}"""));
        Assert.Null(UpdateManifest.Parse(json.Replace("https://dic", "http://dic")));
        Assert.Null(UpdateManifest.Parse("이상한 값"));
    }
}

public class PackInstallTests : IDisposable
{
    readonly string root = Path.Combine(Path.GetTempPath(), "edudic-test-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(root, true); } catch (Exception) { }
    }

    static string Zip(string dir, string name, Dictionary<string, string> files)
    {
        var path = Path.Combine(dir, name + ".zip");
        using (var z = ZipFile.Open(path, ZipArchiveMode.Create))
            foreach (var (rel, text) in files)
            {
                using var w = new StreamWriter(z.CreateEntry(rel.Replace('\\', '/')).Open());
                w.Write(text);
            }
        return path;
    }

    static PackInfo Pack(string name, string zip) => new() { Name = name, Sha256 = Packs.Sha256Hex(zip), Size = new FileInfo(zip).Length, Url = "https://x/" + name };

    [Fact]
    public async Task 바뀐_팩만_내려받고_나머지는_지금_폴더에서_가져온다()
    {
        var src = Directory.CreateDirectory(Path.Combine(root, "src")).FullName;
        var runtime = Pack("runtime", Zip(src, "runtime", new() { ["coreclr.dll"] = "런타임", ["ko\\res.dll"] = "한글" }));
        var app1 = Pack("app", Zip(src, "app1", new() { ["어린이 쉬운 사전.dll"] = "앱 1" }));
        var zips = new Dictionary<string, string> { [runtime.Sha256] = Path.Combine(src, "runtime.zip"), [app1.Sha256] = Path.Combine(src, "app1.zip") };
        var fetched = new List<string>();
        Task Download(PackInfo p, string to)
        {
            fetched.Add(p.Name);
            File.Copy(zips[p.Sha256], to);
            return Task.CompletedTask;
        }

        var v1 = Path.Combine(root, "versions", "0.5.0");
        await Packs.BuildAsync(v1, [app1, runtime], null, Download);
        Assert.Equal(["app", "runtime"], fetched);
        Assert.Equal("한글", File.ReadAllText(Path.Combine(v1, "ko", "res.dll")));

        // 0.5.1: 앱만 바뀜 → app 팩만 내려받는다
        var app2 = Pack("app", Zip(src, "app2", new() { ["어린이 쉬운 사전.dll"] = "앱 2" }));
        zips[app2.Sha256] = Path.Combine(src, "app2.zip");
        fetched.Clear();
        var v2 = Path.Combine(root, "versions", "0.5.1");
        var bytes = await Packs.BuildAsync(v2, [app2, runtime], v1, Download);
        Assert.Equal(["app"], fetched);
        Assert.Equal(app2.Size, bytes);
        Assert.Equal("앱 2", File.ReadAllText(Path.Combine(v2, "어린이 쉬운 사전.dll")));
        Assert.Equal("런타임", File.ReadAllText(Path.Combine(v2, "coreclr.dll")));
        Assert.Equal("앱 1", File.ReadAllText(Path.Combine(v1, "어린이 쉬운 사전.dll"))); // 지금 버전은 그대로
        Assert.Equal(runtime.Sha256, Packs.ReadRecord(v2)["runtime"].Info.Sha256);
        Assert.False(Directory.Exists(v2 + ".tmp"));
    }

    [Fact]
    public async Task 해시가_틀린_팩은_거부하고_폴더를_남기지_않는다()
    {
        var src = Directory.CreateDirectory(Path.Combine(root, "src")).FullName;
        var zip = Zip(src, "app", new() { ["a.dll"] = "a" });
        var bad = new PackInfo { Name = "app", Sha256 = new string('0', 64), Size = 1, Url = "https://x/app" };
        var dir = Path.Combine(root, "versions", "0.5.0");
        await Assert.ThrowsAsync<InvalidDataException>(() => Packs.BuildAsync(dir, [bad], null, (p, to) => { File.Copy(zip, to); return Task.CompletedTask; }));
        Assert.False(Directory.Exists(dir));
        Assert.False(Directory.Exists(dir + ".tmp"));
    }

    [Fact]
    public async Task 상위_폴더로_나가는_경로는_거부한다()
    {
        var src = Directory.CreateDirectory(Path.Combine(root, "src")).FullName;
        var zip = Zip(src, "evil", new() { ["../../evil.dll"] = "x" });
        var p = Pack("app", zip);
        await Assert.ThrowsAsync<InvalidDataException>(() => Packs.BuildAsync(Path.Combine(root, "v"), [p], null, (_, to) => { File.Copy(zip, to); return Task.CompletedTask; }));
        Assert.False(File.Exists(Path.Combine(root, "evil.dll")));
    }

    [Fact]
    public void 정션으로_버전_폴더를_가리키고_정션만_지울_수_있다()
    {
        var target = Directory.CreateDirectory(Path.Combine(root, "versions", "0.5.0")).FullName;
        File.WriteAllText(Path.Combine(target, "a.txt"), "안녕");
        var link = Path.Combine(root, "app");
        InstallLayout.Junction.Create(link, target);
        Assert.True((File.GetAttributes(link) & FileAttributes.ReparsePoint) != 0);
        Assert.Equal("안녕", File.ReadAllText(Path.Combine(link, "a.txt")));
        Directory.Delete(link); // 정션만 지운다
        Assert.False(Directory.Exists(link));
        Assert.True(File.Exists(Path.Combine(target, "a.txt")));
    }

    [Theory]
    [InlineData("어린이 쉬운 사전.exe", "app")]
    [InlineData("어린이 쉬운 사전.runtimeconfig.json", "app")]
    [InlineData("EduDic.Core.dll", "app")]
    [InlineData("Microsoft.AspNetCore.Components.dll", "web")]
    [InlineData("Microsoft.Web.WebView2.Wpf.dll", "web")]
    [InlineData("runtimes\\win-x64\\native\\WebView2Loader.dll", "web")]
    [InlineData("PresentationFramework.dll", "runtime")]
    [InlineData("ko\\PresentationCore.resources.dll", "runtime")]
    public void 팩_나누기(string rel, string pack) => Assert.Equal(pack, Packs.Classify(rel));
}
