using System.Net.Http;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using EduDic.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Web.WebView2.Core;

namespace EduDic.App;

/// <summary>스팟라이트 창. 화면은 Blazor(Main.razor), 크기·위치·전체화면·숨기기는 여기서</summary>
public partial class MainWindow : Window, IHost
{
    const int WM_NCLBUTTONDOWN = 0xA1;
    const int HTCAPTION = 2;
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    CoreWebView2? core;
    bool quitting;
    bool moving;          // 코드로 옮기는 중 (사용자가 끈 위치와 구분)
    double anchorTop = double.NaN; // 검색창 자리 — 결과 화면이 화면 밖으로 나가면 잠시 위로 올렸다가 되돌린다
    Rect? beforeFullscreen;

    public event Action? Shown;
    public string Version => AppPaths.Version;
    public bool IsFullscreen => beforeFullscreen != null;

    public MainWindow()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd($"EduDicDesktop/{AppPaths.Version}");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/json");

        var services = new ServiceCollection();
        services.AddWpfBlazorWebView();
        services.AddSingleton(new DictClient(http));
        services.AddSingleton<IHost>(this);
        Resources.Add("services", services.BuildServiceProvider());

        // 첫 화면부터 배경을 투명하게 (캡슐 바깥이 비쳐 보여야 한다)
        Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00FFFFFF");
        InitializeComponent();

        WebView.BlazorWebViewInitializing += (_, e) =>
        {
            e.UserDataFolder = AppPaths.WebView;
            // 그래픽 가속을 끄면 GPU 프로세스만큼 메모리가 준다 (늘 떠 있는 작은 앱)
            var args = "--disable-gpu --disable-gpu-compositing";
            if (int.TryParse(Environment.GetEnvironmentVariable("EDUDIC_CDP_PORT"), out var port)) args += $" --remote-debugging-port={port}";
            e.EnvironmentOptions = new CoreWebView2EnvironmentOptions(args);
        };
        WebView.BlazorWebViewInitialized += (_, e) =>
        {
            core = e.WebView.CoreWebView2;
            e.WebView.DefaultBackgroundColor = System.Drawing.Color.Transparent;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            // 바깥 링크는 기본 브라우저로
            core.NewWindowRequested += (_, a) => { a.Handled = true; OpenUrl(a.Uri); };
            core.WebMessageReceived += (_, m) =>
            {
                string? msg;
                try { msg = m.TryGetWebMessageAsString(); } catch (ArgumentException) { return; }
                if (msg == "edudic:drag") DragWindow();
            };
        };

        SourceInitialized += (_, _) => CenterOnScreen(Height);
        LocationChanged += (_, _) => { if (!moving && !IsFullscreen) anchorTop = Top; };
        Activated += (_, _) => Shown?.Invoke();
        // Alt+F4 등으로 닫으면 끄지 않고 트레이로
        Closing += (_, e) =>
        {
            if (quitting) return;
            e.Cancel = true;
            HideWindow();
        };
    }

    // ── 보이기·숨기기 ─────────────────────────────────────
    public void ShowAndFocus()
    {
        if (!IsVisible) Show();
        Activate();
        Topmost = false; Topmost = true; // 다른 항상-위 창보다 앞으로
        WebView.Focus();
        SetMemory(low: false);
        Shown?.Invoke();
    }

    public void Toggle()
    {
        if (IsVisible && IsActive) HideWindow();
        else ShowAndFocus();
    }

    public void HideWindow()
    {
        Dispatcher.Invoke(() =>
        {
            Hide();
            SetMemory(low: true);
        });
    }

    public void Quit()
    {
        quitting = true;
        Close();
    }

    void SetMemory(bool low)
    {
        try { if (core != null) core.MemoryUsageTargetLevel = low ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal; }
        catch (Exception) { /* 옛 런타임 */ }
    }

    // ── 크기·위치 ─────────────────────────────────────────
    /// <summary>지금 창이 있는 모니터의 작업 영역 (DIP)</summary>
    Rect WorkArea(bool full = false)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var screen = hwnd == IntPtr.Zero ? System.Windows.Forms.Screen.PrimaryScreen! : System.Windows.Forms.Screen.FromHandle(hwnd);
        var r = full ? screen.Bounds : screen.WorkingArea;
        var dpi = VisualTreeHelper.GetDpi(this);
        return new Rect(r.Left / dpi.DpiScaleX, r.Top / dpi.DpiScaleY, r.Width / dpi.DpiScaleX, r.Height / dpi.DpiScaleY);
    }

    void Move(Action a)
    {
        moving = true;
        try { a(); } finally { moving = false; }
    }

    /// <summary>옛 앱처럼 처음엔 화면 가운데</summary>
    void CenterOnScreen(double height)
    {
        var wa = WorkArea();
        Move(() =>
        {
            Left = wa.Left + (wa.Width - Width) / 2;
            Top = wa.Top + (wa.Height - height) / 2;
        });
        anchorTop = Top;
    }

    public void SetHeight(double height) => Dispatcher.Invoke(() =>
    {
        if (IsFullscreen) return;
        var wa = WorkArea();
        if (double.IsNaN(anchorTop)) anchorTop = Top;
        Move(() =>
        {
            Width = WindowSize.Width;
            Height = height;
            // 아래로 늘다가 화면 밖으로 나가면 그만큼만 위로 (검색창으로 돌아오면 원래 자리)
            Top = Math.Max(wa.Top, Math.Min(anchorTop, wa.Bottom - height));
        });
    });

    public bool ToggleFullscreen() => Dispatcher.Invoke(() =>
    {
        if (IsFullscreen) { ExitFullscreen(); return false; }
        beforeFullscreen = new Rect(Left, Top, Width, Height);
        var b = WorkArea(full: true);
        Move(() => { Left = b.Left; Top = b.Top; Width = b.Width; Height = b.Height; });
        return true;
    });

    /// <summary>전체화면 끝: 옛 앱처럼 500×680 으로 화면 가운데</summary>
    public void ExitFullscreen() => Dispatcher.Invoke(() =>
    {
        if (!IsFullscreen) return;
        beforeFullscreen = null;
        Move(() => { Width = WindowSize.Width; Height = WindowSize.Result; });
        CenterOnScreen(WindowSize.Result);
    });

    void DragWindow()
    {
        if (IsFullscreen) return;
        var hwnd = new WindowInteropHelper(this).Handle;
        ReleaseCapture();
        SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, IntPtr.Zero);
    }

    public void OpenUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == "https" || u.Scheme == "http"))
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u.ToString()) { UseShellExecute = true });
    }
}
