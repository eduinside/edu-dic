using System.IO;
using System.Windows.Forms;

namespace EduDic.App;

/// <summary>트레이 아이콘: 왼쪽 클릭 = 사전 열기, 메뉴 = 버전 · 사전 열기 · 웹 사전 · 시작 시 실행 · 사용 통계 보내기 · 이용 안내 · 종료</summary>
public sealed class Tray : IDisposable
{
    readonly NotifyIcon icon;

    public Tray(Action open, Action openWeb, Action quit, Settings settings)
    {
        // app.ico 에서 트레이 크기(보통 16px, 배율에 따라 더 큼)에 맞는 그림을 고른다
        using var ico = System.Windows.Application.GetResourceStream(new Uri("pack://application:,,,/app.ico")).Stream;
        var appIcon = new System.Drawing.Icon(ico, SystemInformation.SmallIconSize);
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem($"어린이 쉬운 사전 v{AppPaths.Version}") { Enabled = false });
        menu.Items.Add("사전 열기 (Ctrl+Alt+D)", null, (_, _) => open());
        menu.Items.Add("웹 사전 열기 (dic.dgedu.link)", null, (_, _) => openWeb());
        menu.Items.Add(new ToolStripSeparator());
        var auto = new ToolStripMenuItem("Windows 시작 시 실행") { CheckOnClick = false };
        auto.Click += (_, _) =>
        {
            try { Autostart.Set(!Autostart.IsEnabled, AppPaths.LaunchExe); } catch (Exception) { /* 레지스트리 막힘 */ }
        };
        // 사용 통계: 한 번 눌러 끄고 켠다 (이용 안내 — terms.txt)
        var stats = new ToolStripMenuItem("사용 통계 보내기") { CheckOnClick = false, ToolTipText = "몇 명이 쓰는지 세는 무작위 번호만 보내요. 끄면 보내지 않아요." };
        stats.Click += (_, _) =>
        {
            settings.UsageStats = !settings.UsageStats;
            settings.Save();
        };
        menu.Opening += (_, _) =>
        {
            auto.Checked = Autostart.IsEnabled;
            stats.Checked = settings.UsageStats;
            stats.Visible = AppPaths.Installed; // 설치판만 업데이트를 확인한다
        };
        menu.Items.Add(auto);
        menu.Items.Add(stats);
        menu.Items.Add("이용 안내", null, (_, _) => ShowTerms());
        menu.Items.Add("종료", null, (_, _) => quit());

        icon = new NotifyIcon
        {
            Icon = appIcon,
            Text = AppPaths.ProductName,
            ContextMenuStrip = menu,
            Visible = true,
        };
        icon.MouseUp += (_, e) => { if (e.Button == MouseButtons.Left) open(); };
    }

    /// <summary>이용 안내 (앱 안 글 terms.txt — 초등 눈높이)</summary>
    static void ShowTerms()
    {
        string text;
        using (var s = typeof(Tray).Assembly.GetManifestResourceStream("terms.txt"))
        using (var r = new StreamReader(s!)) text = r.ReadToEnd();
        System.Windows.MessageBox.Show(text, AppPaths.ProductName + " 이용 안내", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Information);
    }

    /// <summary>트레이 풍선 알림</summary>
    public void Balloon(string title, string text) => icon.ShowBalloonTip(5000, title, text, ToolTipIcon.Info);

    public void Dispose()
    {
        icon.Visible = false;
        icon.Dispose();
    }
}
