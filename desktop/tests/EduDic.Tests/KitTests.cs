using DesktopKit;
using EduDic.Core;
using EduDic.Sign;

namespace EduDic.Tests;

/// <summary>공용 모듈 DesktopKit 으로 옮긴 설치·업데이트 (0.6.0, docs/plan-desktop-kit.md)</summary>
public class KitTests
{
    [Fact]
    public void 앱_값은_옛_판과_이어진다()
    {
        // 공개키가 바뀌면 설치된 앱이 업데이트를 못 받는다 (0.4.0~ 키)
        Assert.Equal("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEYSSRkmR7pDQiAjEocPEYPKHkUgMmaDAJ/35X7AWDvGXWx+JWE8p2+8mxnix3n5T7F8qFusBvHCmvz9DsV+vO1w==", AppKit.Info.PublicKey);
        Assert.Equal("edu-dic", AppKit.Info.Id);
        Assert.Equal("EDU_DIC", AppKit.Info.EnvPrefix);
        Assert.Equal("https://eduin.info/downloads/apps/edu-dic/latest.json", AppKit.Info.ManifestUrl);
        Assert.Equal("어린이 쉬운 사전 데스크탑", AppKit.Info.Name); // 바로가기·시작 프로그램 값 이름
        Assert.EndsWith(@"Programs\EduDic", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppKit.Info.InstallDirName));
    }

    static List<KitPack> SamplePacks() =>
    [
        new() { Name = "runtime", Sha256 = new string('B', 64), Size = 70000000, File = "pack-b.zip" },
        new() { Name = "app", Sha256 = new string('a', 64), Size = 1200000, File = "pack-a.zip" },
    ];

    [Fact]
    public void 옛_매니페스트_서명_글은_0_5_0_형식()
    {
        Assert.Equal($"edudic-packs|0.6.0|app:{new string('a', 64)}:1200000;runtime:{new string('b', 64)}:70000000", Legacy.PacksText("0.6.0", SamplePacks()));
        Assert.Equal($"edudic-desktop|0.6.0|{new string('c', 64)}", Legacy.FileText("0.6.0", new string('C', 64)));
    }

    [Fact]
    public void 옛_매니페스트를_만들고_서명을_확인한다()
    {
        using var t = new Temp();
        var setup = Path.Combine(t.Path, "setup.exe");
        File.WriteAllText(setup, "설치 파일");
        var (priv, pub) = KitSign.NewKey();
        var m = new KitManifest { Id = "edu-dic", Version = "0.6.0", Packs = SamplePacks(), Notes = ["바뀐 점"],
            Files = new KitFiles { Setup = new KitFile { Name = "EduDic-0.6.0-Setup.exe", Sha256 = KitSign.Sha256Hex(setup), Size = 9 } } };
        var json = Legacy.Manifest(m, setup, priv, pub, "https://dic.dgedu.link/api/download/pack/", "https://dic.dgedu.link/api/download/desktop", "mini");
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var r = doc.RootElement;
        Assert.Equal("0.6.0", r.GetProperty("version").GetString());
        Assert.Equal("바뀐 점", r.GetProperty("notes").GetString());
        Assert.True(KitSign.Verify(Legacy.PacksText("0.6.0", SamplePacks()), r.GetProperty("packsEcdsa").GetString()!, pub));
        Assert.True(KitSign.Verify(Legacy.FileText("0.6.0", KitSign.Sha256Hex(setup)), r.GetProperty("ecdsa").GetString()!, pub));
        Assert.Equal("https://dic.dgedu.link/api/download/pack/" + new string('a', 64), r.GetProperty("packs")[0].GetProperty("url").GetString());
        Assert.Equal("mini", r.GetProperty("platforms").GetProperty("windows-x86_64").GetProperty("signature").GetString());
        // 다른 키로는 만들지 않는다
        Assert.Throws<InvalidDataException>(() => Legacy.Manifest(m, setup, KitSign.NewKey().Private, pub, "x/", "y", ""));
    }
}

/// <summary>0.5.0 배치 받아들이기 — 시험 설치 폴더(EDU_DIC_TEST_INSTALL_DIR)에서</summary>
public class LegacyLayoutTests : IDisposable
{
    readonly Temp t = new();
    readonly KitApp app;

    public LegacyLayoutTests()
    {
        Environment.SetEnvironmentVariable("EDU_DIC_TEST_INSTALL_DIR", t.Path);
        app = new KitApp { Id = "edu-dic-test", ExeName = "앱.exe", InstallDirName = "x", SetupName = "EduDic-Setup" };
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("EDU_DIC_TEST_INSTALL_DIR", null);
        t.Dispose();
    }

    /// <summary>0.5.0 이 깐 꼴: versions\판\(packs.txt·exe·설치 파일 사본) + app 정션, install.json 없음</summary>
    string Old050(string version)
    {
        var dir = app.VersionDir(version);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "packs.txt"), "@app " + new string('a', 64) + " 1\n앱.exe\n");
        File.WriteAllText(Path.Combine(dir, "앱.exe"), "exe");
        File.WriteAllText(Path.Combine(dir, "EduDic-Setup.exe"), "setup");
        KitLayout.PointAppTo(app, dir);
        return dir;
    }

    [Fact]
    public void 판_폴더에서_돌면_install_json_을_만들고_한_번만()
    {
        var dir = Old050("0.6.0");
        Assert.True(LegacyLayout.Adopt(app, dir, "0.6.0"));
        Assert.Equal("0.6.0", KitLayout.InstalledVersion(app));
        var id = KitLayout.InstallId(app);
        Assert.NotNull(id);
        Assert.Equal(t.Path, KitLayout.InstallRootOf(dir));
        Assert.Equal(t.Path, KitLayout.InstallRootOf(app.AppDir)); // 바로가기(app 정션)로 켠 경우
        Assert.False(LegacyLayout.Adopt(app, dir, "0.6.0"));
        Assert.Equal(id, KitLayout.InstallId(app));
    }

    [Fact]
    public void 설치_폴더_밖이나_packs_txt_가_없으면_받아들이지_않는다()
    {
        var dev = Path.Combine(t.Path, "bin", "Debug");
        Directory.CreateDirectory(dev);
        Assert.False(LegacyLayout.Adopt(app, dev, "0.6.0"));
        var bare = app.VersionDir("0.6.0");
        Directory.CreateDirectory(bare);
        Assert.False(LegacyLayout.Adopt(app, bare, "0.6.0"));
        Assert.False(File.Exists(app.InstallJson));
    }

    [Fact]
    public void 설치_파일_사본을_놓고_옛_단일_exe_를_지운다()
    {
        var dir = Old050("0.6.0");
        Assert.True(LegacyLayout.PlaceSetupCopy(app, app.AppDir));
        Assert.Equal("setup", File.ReadAllText(app.SetupCopy));
        File.WriteAllText(Path.Combine(dir, "EduDic-Setup.exe"), "새것");
        Assert.True(LegacyLayout.PlaceSetupCopy(app, dir)); // 있으면 그대로 (kit 설치 파일이 둔 사본)
        Assert.Equal("setup", File.ReadAllText(app.SetupCopy));

        var single = Path.Combine(t.Path, "앱.exe");
        File.WriteAllText(single, "0.4.x");
        File.WriteAllText(single + ".old", "0.4.x");
        LegacyLayout.RemoveSingleExe(app);
        Assert.False(File.Exists(single));
        Assert.False(File.Exists(single + ".old"));
        Assert.True(File.Exists(Path.Combine(app.AppDir, "앱.exe")));
    }
}

sealed class Temp : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "edudic-test-" + Guid.NewGuid().ToString("N")[..8]);
    public Temp() => Directory.CreateDirectory(Path);
    public void Dispose() { try { KitLayout.DeleteTree(Path); } catch (Exception) { } }
}
