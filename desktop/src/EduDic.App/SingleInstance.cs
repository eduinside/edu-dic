namespace EduDic.App;

/// <summary>
/// 앱을 하나만: 두 번째 실행은 이미 떠 있는 창을 앞으로 부르고 끝낸다.
/// 설치 프로그램·제거는 Quit 신호로 떠 있는 앱을 끈다 (Core.InstallLayout.QuitRunning).
/// </summary>
public static class SingleInstance
{
    const string Base = "Local\\EduDicDesktop";
    static Mutex? mutex;
    static EventWaitHandle? showSignal, quitSignal;

    /// <summary>첫 실행이면 true. 아니면 기존 창에 ‘앞으로’ 신호를 보내고 false</summary>
    public static bool Acquire(bool waitForPrevious)
    {
        mutex = new Mutex(true, Base, out var created);
        showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Base + "-Show");
        quitSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Base + "-Quit");
        if (created) return true;
        if (waitForPrevious)
        {
            try { if (mutex.WaitOne(TimeSpan.FromSeconds(30))) return true; }
            catch (AbandonedMutexException) { return true; }
        }
        showSignal.Set();
        return false;
    }

    public static void Listen(Action show, Action quit)
    {
        if (showSignal == null || quitSignal == null) return;
        var handles = new WaitHandle[] { showSignal, quitSignal };
        new Thread(() =>
        {
            while (true)
            {
                if (WaitHandle.WaitAny(handles) == 0) show();
                else { quit(); return; }
            }
        }) { IsBackground = true, Name = "EduDic single instance" }.Start();
    }
}
