namespace EduDic.Core;

/// <summary>결과 카드·검색창이 쓰는 화면 규칙 (옛 App.tsx 와 같은 규칙)</summary>
public static class DictView
{
    static readonly HashSet<char> ChoseongSet = [.. "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"];

    /// <summary>초성만 입력했는지 (예: "ㄷㄱ")</summary>
    public static bool IsChoseongOnly(string s)
    {
        var t = s.Trim();
        return t.Length > 0 && t.All(ChoseongSet.Contains);
    }

    /// <summary>뜻이 여러 갈래면 그대로, 하나면 표제어 자체를 갈래 하나로</summary>
    public static IReadOnlyList<DictHomograph> Homographs(DictEntry e) =>
        e.Homographs is { Count: > 1 } h
            ? h
            : [new DictHomograph { Pos = e.Pos, Level = e.Level, Senses = e.Senses, Image = e.Image, Audio = e.Audio, EasySenses = e.EasySenses }];

    /// <summary>동형이의어 탭 미리보기: 첫 뜻 12자</summary>
    public static string Preview(DictHomograph h)
    {
        var p = h.Senses.FirstOrDefault()?.Def ?? "";
        return p.Length > 12 ? p[..12] + "…" : p;
    }

    static string SourceName(string? source) => source switch
    {
        "encykorea" => "한국민족문화대백과사전",
        "naver" => "네이버 이미지 검색",
        _ => "국립국어원 한국어기초사전",
    };

    /// <summary>"출처: 사전[, 사진 출처]" — 같으면 한 번만</summary>
    public static string SourceLabel(DictEntry e, DictImage? image)
    {
        var dict = SourceName(e.Source == "encykorea" ? "encykorea" : "krdict");
        if (image != null)
        {
            var img = SourceName(image.Source);
            if (img != dict) return $"출처: {dict}, {img}";
        }
        return $"출처: {dict}";
    }

    /// <summary>못 찾았을 때 검색창 아래 잠깐 띄우는 말</summary>
    public static string FailureMessage(LookupResult r, string word) =>
        r.Status == "blocked" ? "이 낱말은 찾을 수 없어요."
        : !string.IsNullOrEmpty(r.Suggestion) ? $"‘{word}’ 대신 ‘{r.Suggestion}’을(를) 찾아볼까요?"
        : $"‘{word}’(은)는 아직 준비 중인 낱말이에요.";

    /// <summary>숫자(동형이의어 번호)를 뺀 낱말 — 형광펜·발음에 쓴다</summary>
    public static string CleanWord(string word) => new string(word.Where(c => !char.IsAsciiDigit(c)).ToArray()).Trim();

    /// <summary>예문에서 낱말만 형광펜으로: (조각, 낱말인가) 목록</summary>
    public static List<(string Text, bool Match)> Highlight(string text, string word)
    {
        var w = CleanWord(word);
        if (w.Length == 0 || string.IsNullOrEmpty(text)) return [(text ?? "", false)];
        var parts = new List<(string, bool)>();
        var i = 0;
        while (i < text.Length)
        {
            var j = text.IndexOf(w, i, StringComparison.Ordinal);
            if (j < 0) { parts.Add((text[i..], false)); break; }
            if (j > i) parts.Add((text[i..j], false));
            parts.Add((w, true));
            i = j + w.Length;
        }
        return parts;
    }

    /// <summary>누리집 주소: 동형이의어가 여러 개면 #번호</summary>
    public static string WebUrl(DictEntry e, int homoIndex) =>
        $"{DictClient.DefaultBase}/{Uri.EscapeDataString(e.Word)}{(e.Homographs is { Count: > 1 } ? $"#{homoIndex + 1}" : "")}";
}

/// <summary>창 높이 (논리 픽셀): 검색창 92 · 추천 목록 최대 580 · 결과 680</summary>
public static class WindowSize
{
    public const double Width = 500;
    public const double Search = 92;
    public const double Result = 680;

    public static double For(bool hasResult, int suggestionCount) =>
        hasResult ? Result
        : suggestionCount > 0 ? Math.Min(Search + 20 + suggestionCount * 52 + 36, 580)
        : Search;
}
