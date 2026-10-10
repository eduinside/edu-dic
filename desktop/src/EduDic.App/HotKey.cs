using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace EduDic.App;

/// <summary>전역 단축키 (기본 Ctrl+Alt+D) — 어디서든 사전을 열고 닫는다</summary>
public sealed class HotKey : IDisposable
{
    const int WM_HOTKEY = 0x0312;
    const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_NOREPEAT = 0x4000;
    const uint VK_D = 0x44;
    const int Id = 0xED1C;

    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    readonly HwndSource source;
    readonly Action pressed;
    public bool Registered { get; }

    public HotKey(Action pressed)
    {
        this.pressed = pressed;
        // 보이지 않는 메시지 전용 창에 단축키를 건다 (본창이 숨어 있어도 받는다)
        source = new HwndSource(new HwndSourceParameters("EduDicHotKey") { ParentWindow = new IntPtr(-3), WindowStyle = 0 });
        source.AddHook(Hook);
        Registered = RegisterHotKey(source.Handle, Id, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_D);
    }

    IntPtr Hook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_HOTKEY && wParam.ToInt32() == Id)
        {
            handled = true;
            pressed();
        }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        UnregisterHotKey(source.Handle, Id);
        source.Dispose();
    }
}
