namespace EduDic.App;

/// <summary>화면(Blazor)이 창(WPF)에 부탁하는 일 — 화면 코드가 WPF를 몰라도 되게</summary>
public interface IHost
{
    string Version { get; }
    bool IsFullscreen { get; }
    /// <summary>창 높이 (논리 픽셀, 폭은 500 고정)</summary>
    void SetHeight(double height);
    /// <summary>전체화면 켜고 끄기. 바뀐 상태를 돌려준다</summary>
    bool ToggleFullscreen();
    void ExitFullscreen();
    /// <summary>트레이로 숨기기</summary>
    void HideWindow();
    void OpenUrl(string url);
    /// <summary>창이 나타나거나 앞으로 올 때 (입력칸 포커스용)</summary>
    event Action? Shown;
}
