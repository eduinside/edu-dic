namespace EduDic.App;

/// <summary>
/// 앱을 하나만: 두 번째 실행은 이미 떠 있는 창을 앞으로 부르고 끝낸다.
/// 설치기·제거기는 Quit 신호로 떠 있는 앱을 끈다.
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

    /// <summary>떠 있는 앱을 끄고 끝날 때까지 기다린다 (설치·제거용). 떠 있지 않았으면 바로 true</summary>
    public static bool QuitRunning(TimeSpan timeout)
    {
        if (!Mutex.TryOpenExisting(Base, out var m)) return true;
        using (m)
        {
            if (EventWaitHandle.TryOpenExisting(Base + "-Quit", out var q)) using (q) q.Set();
            try { if (!m.WaitOne(timeout)) return false; m.ReleaseMutex(); return true; }
            catch (AbandonedMutexException) { return true; }
        }
    }
}
