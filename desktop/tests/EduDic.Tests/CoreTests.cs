using System.Text.Json;
using EduDic.Core;

namespace EduDic.Tests;

public class DictViewTests
{
    [Theory]
    [InlineData("ㄷㄱ", true)]
    [InlineData(" ㄱㄲㅎ ", true)]
    [InlineData("ㄷ구", false)]
    [InlineData("대구", false)]
    [InlineData("", false)]
    [InlineData("ㅏ", false)]
    public void 초성만_입력했는지(string s, bool expected) => Assert.Equal(expected, DictView.IsChoseongOnly(s));

    [Fact]
    public void 형광펜_나누기_숫자_뗀_낱말만()
    {
        var parts = DictView.Highlight("사과를 먹고 사과를 또", "사과2");
        Assert.Equal([("사과", true), ("를 먹고 ", false), ("사과", true), ("를 또", false)], parts);
    }

    [Fact]
    public void 형광펜_없는_낱말이면_통째로() =>
        Assert.Equal([("하늘이 맑다", false)], DictView.Highlight("하늘이 맑다", "바다"));

    [Fact]
    public void 출처_사전과_사진이_같으면_한번만()
    {
        var e = new DictEntry { Word = "사과", Source = "krdict" };
        Assert.Equal("출처: 국립국어원 한국어기초사전", DictView.SourceLabel(e, new DictImage("u", null, null, "krdict")));
        Assert.Equal("출처: 국립국어원 한국어기초사전, 네이버 이미지 검색", DictView.SourceLabel(e, new DictImage("u", null, null, "naver")));
        Assert.Equal("출처: 한국민족문화대백과사전", DictView.SourceLabel(e with { Source = "encykorea" }, new DictImage("u", null, null, "encykorea")));
        Assert.Equal("출처: 국립국어원 한국어기초사전", DictView.SourceLabel(e, null));
    }

    [Fact]
    public void 못찾았을때_말()
    {
        Assert.Equal("이 낱말은 찾을 수 없어요.", DictView.FailureMessage(new() { Status = "blocked" }, "x"));
        Assert.Equal("‘사가’ 대신 ‘사과’을(를) 찾아볼까요?", DictView.FailureMessage(new() { Status = "not_found", Suggestion = "사과" }, "사가"));
        Assert.Equal("‘뭐’(은)는 아직 준비 중인 낱말이에요.", DictView.FailureMessage(new() { Status = "not_ready" }, "뭐"));
    }

    [Fact]
    public void 동형이의어_하나면_표제어를_갈래로()
    {
        var e = new DictEntry { Word = "배", Pos = "명사", Senses = [new("먹는 과일")] };
        var h = DictView.Homographs(e);
        Assert.Single(h);
        Assert.Equal("명사", h[0].Pos);
        Assert.Equal("https://dic.dgedu.link/%EB%B0%B0", DictView.WebUrl(e, 0));

        var multi = e with { Homographs = [new() { Senses = [new("사람이나 동물의 몸에서 가슴과 엉덩이 사이")] }, new() { Senses = [new("배")] }] };
        Assert.Equal(2, DictView.Homographs(multi).Count);
        Assert.Equal("사람이나 동물의 몸에서…", DictView.Preview(DictView.Homographs(multi)[0]));
        Assert.EndsWith("#2", DictView.WebUrl(multi, 1));
    }

    [Theory]
    [InlineData(false, 0, 92)]
    [InlineData(false, 3, 92 + 20 + 3 * 52 + 36)]
    [InlineData(false, 25, 580)]
    [InlineData(true, 5, 680)]
    public void 창_높이(bool result, int n, double h) => Assert.Equal(h, WindowSize.For(result, n));

    [Fact]
    public void 결과_JSON_읽기()
    {
        const string json = """
        {"status":"ok","entry":{"word":"사과","reading":"사과","pos":"명사","level":"초급","senses":[{"def":"사과나무의 열매.","example":"사과를 먹다."}],
         "image":{"url":"https://x/y.jpg","license":"CC","attribution":"a","source":"krdict"},"audio":{"url":"https://x/a.mp3","attribution":"b"},
         "source":"krdict","fetchedAt":"2026-10-10T00:00:00Z","easySenses":null}}
        """;
        var r = JsonSerializer.Deserialize<LookupResult>(json, DictClient.Json)!;
        Assert.True(r.Ok);
        Assert.Equal("사과", r.Entry!.Word);
        Assert.Equal("사과를 먹다.", r.Entry.Senses[0].Example);
        Assert.Equal("https://x/a.mp3", r.Entry.Audio!.Url);
        Assert.Null(r.Entry.Homographs);
    }
}

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
    public void 서명_왕복과_변조_거부()
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

    [Fact]
    public void 매니페스트_새앱과_옛앱_필드()
    {
        var sha = new string('c', 64);
        var json = $$$"""
        {"version":"0.4.2","notes":"고침","pub_date":"2026-10-10T00:00:00Z",
         "platforms":{"windows-x86_64":{"signature":"minisign","url":"https://dic.dgedu.link/api/download/desktop"}},
         "sha256":"{{{sha}}}","ecdsa":"c2ln"}
        """;
        var m = UpdateManifest.Parse(json)!;
        Assert.Equal(new Version(0, 4, 2), m.Version);
        Assert.Equal("https://dic.dgedu.link/api/download/desktop", m.Url);
        Assert.Equal(sha, m.Sha256);

        // 옛 Tauri 전용(새 필드 없음)·http 주소는 받지 않는다
        Assert.Null(UpdateManifest.Parse("""{"version":"0.3.0","platforms":{"windows-x86_64":{"signature":"s","url":"https://x"}}}"""));
        Assert.Null(UpdateManifest.Parse(json.Replace("https://dic", "http://dic")));
        Assert.Null(UpdateManifest.Parse("이상한 값"));
    }
}
