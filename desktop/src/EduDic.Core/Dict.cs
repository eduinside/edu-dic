using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace EduDic.Core;

// dic.dgedu.link API 응답 형태 (웹 app/lib, 옛 데스크탑 src/lib/api.ts 와 같은 필드)

public sealed record DictAudio(string Url, string? Attribution);

public sealed record DictImage(string Url, string? License, string? Attribution, string? Source);

public sealed record DictSense(string Def, string? Example = null, List<string>? Synonyms = null, List<string>? Antonyms = null);

public sealed record DictHomograph
{
    public string? Pos { get; init; }
    public string? Level { get; init; }
    public List<DictSense> Senses { get; init; } = [];
    public DictImage? Image { get; init; }
    public DictAudio? Audio { get; init; }
    public List<DictSense>? EasySenses { get; init; }
}

public sealed record DictEntry
{
    public string Word { get; init; } = "";
    public string? Reading { get; init; }
    public string? Pos { get; init; }
    public string? Level { get; init; }
    public List<DictSense> Senses { get; init; } = [];
    public DictImage? Image { get; init; }
    public DictAudio? Audio { get; init; }
    public string? Source { get; init; }
    public string? FetchedAt { get; init; }
    public List<DictSense>? EasySenses { get; init; }
    public List<DictHomograph>? Homographs { get; init; }
}

/// <summary>status: ok · not_found · blocked · not_ready · error</summary>
public sealed record LookupResult
{
    public string Status { get; init; } = "";
    public DictEntry? Entry { get; init; }
    public string? Word { get; init; }
    public string? Suggestion { get; init; }
    public string? Reason { get; init; }
    public string? Message { get; init; }

    public bool Ok => Status == "ok" && Entry != null;
}

public sealed class DictClient(HttpClient http, string baseUrl = DictClient.DefaultBase)
{
    public const string DefaultBase = "https://dic.dgedu.link";

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    static string Q(string s) => Uri.EscapeDataString(s);

    /// <summary>낱말 찾기. 연결이 안 되면 옛 앱처럼 ‘준비 중’으로 돌려준다</summary>
    public async Task<LookupResult> LookupAsync(string word, CancellationToken ct = default)
    {
        var w = word.Trim();
        if (w.Length == 0) return new() { Status = "not_found", Word = w };
        try
        {
            using var res = await http.GetAsync($"{baseUrl}/api/lookup?q={Q(w)}", ct);
            if (!res.IsSuccessStatusCode)
                return res.StatusCode == HttpStatusCode.NotFound
                    ? new() { Status = "not_ready", Word = w }
                    : new() { Status = "error", Word = w, Message = $"HTTP {(int)res.StatusCode}" };
            var r = await JsonSerializer.DeserializeAsync<LookupResult>(await res.Content.ReadAsStreamAsync(ct), Json, ct);
            return r ?? new() { Status = "not_ready", Word = w };
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            return new() { Status = "not_ready", Word = w };
        }
    }

    public async Task<List<string>> SuggestAsync(string query, CancellationToken ct = default)
    {
        var q = query.Trim();
        if (q.Length == 0) return [];
        try
        {
            using var res = await http.GetAsync($"{baseUrl}/api/suggest?q={Q(q)}", ct);
            if (!res.IsSuccessStatusCode) return [];
            var data = await JsonSerializer.DeserializeAsync<SuggestResponse>(await res.Content.ReadAsStreamAsync(ct), Json, ct);
            return data?.Suggestions ?? [];
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            return [];
        }
    }

    /// <summary>쉬운 말 뜻풀이 (AI). 실패하면 null</summary>
    public async Task<List<DictSense>?> SimplifyAsync(string word, int homographIndex = 0, CancellationToken ct = default)
    {
        try
        {
            using var res = await http.GetAsync($"{baseUrl}/api/simplify?q={Q(word)}&h={homographIndex}", ct);
            if (!res.IsSuccessStatusCode) return null;
            var data = await JsonSerializer.DeserializeAsync<SimplifyResponse>(await res.Content.ReadAsStreamAsync(ct), Json, ct);
            return data?.EasySenses;
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            return null;
        }
    }

    sealed record SuggestResponse(List<string>? Suggestions);
    sealed record SimplifyResponse(string? Status, List<DictSense>? EasySenses);
}
