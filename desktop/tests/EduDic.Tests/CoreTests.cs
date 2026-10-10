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
