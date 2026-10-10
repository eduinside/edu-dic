using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using EduDic.Core;
using Microsoft.Win32;

namespace EduDic.Setup;

/// <summary>
/// 어린이 쉬운 사전 설치 프로그램. 매니페스트 확인(서명) → 필요한 팩만 내려받아 versions\버전 에 깔기 → app 정션 →
/// 앱을 --finish-install 로 띄우면 앱이 바로가기·제거 정보·옛 앱 정리를 맡는다.
/// 인수: --autostart(창 없이, 0.4.x 업데이터가 붙임) · --wait-pid N(앞 프로세스를 기다림).
/// 옛 Tauri 업데이터가 붙이는 /P /R /UPDATE /ARGS 는 무시한다.
/// </summary>
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        using var only = new Mutex(true, "Local\\EduDicSetup", out var first);
        if (!first) return 0; // 이미 설치 중

        var wi = Array.IndexOf(args, "--wait-pid");
        if (wi >= 0 && wi + 1 < args.Length && int.TryParse(args[wi + 1], out var pid))
        {
            try { using var old = Process.GetProcessById(pid); old.WaitForExit(15000); }
            catch (ArgumentException) { }
        }
        var quiet = args.Contains("--autostart");

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        while (true)
        {
            var form = new SetupForm();
            Exception? error = null;
            form.Load += async (_, _) =>
            {
                Log.Write($"시작 args=[{string.Join(" ", args)}]");
                try { await Install.RunAsync(form.Report, quiet); Log.Write("완료"); }
                catch (Exception e) { error = e; Log.Write("실패: " + e); }
                form.Close();
            };
            if (quiet)
            {
                // 창 없이: 폼은 메시지 처리용으로만 (화면에 안 보임)
                form.ShowInTaskbar = false;
                form.Opacity = 0;
                form.WindowState = FormWindowState.Minimized;
            }
            Application.Run(form);
            if (error == null) return 0;
            if (quiet) return 1; // 다음에 앱(설치 프로그램)을 다시 열면 창과 함께 다시 시도한다
            var again = MessageBox.Show($"설치하지 못했어요.\n\n{error.Message}\n\n다시 시도할까요?", InstallLayout.ProductName,
                MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning);
            if (again != DialogResult.Retry) return 1;
        }
    }
}

/// <summary>설치 기록: %TEMP%\EduDicSetup.log (창 없이 돌 때 무엇이 잘못됐는지 확인용)</summary>
static class Log
{
    static readonly string Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "EduDicSetup.log");

    public static void Write(string line)
    {
        try { File.AppendAllText(Path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}\r\n", Encoding.UTF8); } catch (Exception) { }
    }
}

sealed class SetupForm : Form
{
    readonly Label label = new() { AutoSize = false, Dock = DockStyle.Top, Height = 44, TextAlign = ContentAlignment.MiddleLeft };
    readonly ProgressBar bar = new() { Dock = DockStyle.Top, Height = 18, Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 30 };

    public SetupForm()
    {
        Text = InstallLayout.ProductName + " 설치";
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
        Font = new Font("맑은 고딕", 10f);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(440, 96);
        Padding = new Padding(16, 12, 16, 12);
        Controls.Add(bar);
        Controls.Add(label);
        label.Text = "준비하고 있어요…";
    }

    /// <summary>percent &lt; 0 이면 진행 막대를 흐르게(얼마나 남았는지 모를 때)</summary>
    public void Report(string text, int percent)
    {
        if (percent < 0 || percent == 100) Log.Write(text);
        Show(text, percent);
    }

    void Show(string text, int percent) => BeginInvoke(new Action(() =>
    {
        label.Text = text;
        if (percent < 0) { bar.Style = ProgressBarStyle.Marquee; return; }
        bar.Style = ProgressBarStyle.Continuous;
        bar.Value = Math.Max(0, Math.Min(100, percent));
    }));
}

static class Install
{
    public static async Task RunAsync(Action<string, int> report, bool autostart)
    {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("EduDicSetup/1.0");

        // 1) 무엇을 깔지 (매니페스트 + 서명)
        report("새 버전을 확인하고 있어요…", -1);
        var url = InstallLayout.EffectiveManifestUrl;
        var json = await http.GetStringAsync(url + (url.Contains("?") ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks).ConfigureAwait(false);
        var m = Parse(json);
        if (m?.Packs == null || m.Packs.Length == 0 || string.IsNullOrEmpty(m.Version) || string.IsNullOrEmpty(m.PacksEcdsa))
            throw new InvalidDataException("설치 정보를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        var packs = m.Packs.Select(p => new PackInfo { Name = p.Name ?? "", Sha256 = (p.Sha256 ?? "").ToLowerInvariant(), Size = p.Size, Url = p.Url ?? "" }).ToList();
        foreach (var p in packs)
            if (!Uri.TryCreate(p.Url, UriKind.Absolute, out var u) || (u.Scheme != "https" && !u.IsLoopback) || p.Sha256.Length != 64)
                throw new InvalidDataException("설치 정보가 올바르지 않아요.");
        if (!Packs.Verify(Packs.IndexText(m.Version!, packs), m.PacksEcdsa!))
            throw new InvalidDataException("설치 정보의 서명이 맞지 않아요. 안전을 위해 설치를 멈췄어요.");

        // 2) 이 PC 상태: 처음인지(바탕화면 바로가기를 만들지) — 새 앱·0.4.x·옛 Tauri 앱 중 하나라도 있었으면 처음이 아님
        var hadApp = File.Exists(InstallLayout.AppExe);
        var fresh = !hadApp && !File.Exists(InstallLayout.LegacyExe) && !HasOldInstall();

        report("떠 있는 사전을 닫고 있어요…", -1);
        InstallLayout.QuitRunning(TimeSpan.FromSeconds(15));

        // 3) 바뀐 팩만 내려받아 새 버전 폴더 만들기
        var current = hadApp ? InstallLayout.AppDir : null;
        var have = Packs.ReadRecord(current);
        var need = packs.Where(p => !(have.TryGetValue(p.Name, out var h) && h.Info.Sha256 == p.Sha256)).ToList();
        long total = Math.Max(1, need.Sum(p => p.Size)), done = 0;
        Directory.CreateDirectory(InstallLayout.VersionsDir);
        var dir = InstallLayout.VersionDir(m.Version!);
        await Packs.BuildAsync(dir, packs, current, async (pack, path) =>
        {
            using var res = await http.GetAsync(pack.Url, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
            res.EnsureSuccessStatusCode();
            using var src = await res.Content.ReadAsStreamAsync().ConfigureAwait(false);
            using var dst = File.Create(path);
            var buf = new byte[81920];
            int n;
            while ((n = await src.ReadAsync(buf, 0, buf.Length).ConfigureAwait(false)) > 0)
            {
                await dst.WriteAsync(buf, 0, n).ConfigureAwait(false);
                done += n;
                report($"내려받고 있어요… {done / 1048576.0:0.0} / {total / 1048576.0:0.0} MB", (int)(done * 100 / total));
            }
        }).ConfigureAwait(false);

        // 4) app 정션 → 새 버전, 앱이 마무리
        report("마무리하고 있어요…", 100);
        InstallLayout.PointAppTo(dir);
        var arg = "--finish-install" + (fresh ? " --fresh" : "") + (autostart ? " --autostart" : "");
        Process.Start(new ProcessStartInfo(InstallLayout.AppExe, arg) { UseShellExecute = false, WorkingDirectory = InstallLayout.AppDir });
    }

    /// <summary>‘앱 및 기능’에 어린이 쉬운 사전(옛 Tauri 판 포함)이 있는가</summary>
    static bool HasOldInstall()
    {
        using var root = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall");
        if (root == null) return false;
        foreach (var name in root.GetSubKeyNames())
        {
            using var k = root.OpenSubKey(name);
            if (k?.GetValue("DisplayName") is string dn && dn.StartsWith("어린이 쉬운 사전", StringComparison.Ordinal)) return true;
        }
        return false;
    }

    static Manifest? Parse(string json)
    {
        try
        {
            using var ms = new MemoryStream(Encoding.UTF8.GetBytes(json));
            return (Manifest?)new DataContractJsonSerializer(typeof(Manifest)).ReadObject(ms);
        }
        catch (SerializationException) { return null; }
    }

    [DataContract]
    sealed class Manifest
    {
        [DataMember(Name = "version")] public string? Version { get; set; }
        [DataMember(Name = "packs")] public Pack[]? Packs { get; set; }
        [DataMember(Name = "packsEcdsa")] public string? PacksEcdsa { get; set; }
    }

    [DataContract]
    sealed class Pack
    {
        [DataMember(Name = "name")] public string? Name { get; set; }
        [DataMember(Name = "sha256")] public string? Sha256 { get; set; }
        [DataMember(Name = "size")] public long Size { get; set; }
        [DataMember(Name = "url")] public string? Url { get; set; }
    }
}
