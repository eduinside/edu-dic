// 어린이 쉬운 사전 화면 도우미: 창 끌기, 키(F11·ESC·↑↓), 입력창 포커스, 발음 재생
(function () {
  let net = null; // DotNetObjectReference(Main.razor)
  const post = (m) => window.chrome && window.chrome.webview && window.chrome.webview.postMessage(m);

  // 검색창·결과 상단을 눌러 끌면 창이 움직인다 (입력칸·단추는 제외)
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest('[data-drag]')) return;
    if (e.target.closest('input, button, a, summary')) return;
    e.preventDefault();
    post('edudic:drag');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11' || e.key === 'Escape') {
      e.preventDefault();
      if (net) net.invokeMethodAsync('OnKey', e.key);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.matches('input.q')) {
      e.preventDefault();
      if (net) net.invokeMethodAsync('OnKey', e.key);
    }
  });

  // 바깥 링크는 기본 브라우저로 (WPF 가 NewWindowRequested 로 받는다)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && /^https?:\/\//i.test(a.getAttribute('href') || '')) {
      e.preventDefault();
      window.open(a.href, '_blank');
    }
  });

  function speakTts(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }

  window.dic = {
    init(ref) { net = ref; },
    focus(select) {
      const el = document.querySelector('input.q');
      if (!el) return;
      el.focus();
      if (select) el.select();
    },
    // 국어원 공식 MP3 먼저, 없거나 재생이 안 되면 TTS
    speak(word, url) {
      if (url) {
        new Audio(url).play().catch(() => speakTts(word));
        return;
      }
      speakTts(word);
    },
    scrollList(index) {
      const el = document.querySelector(`[data-sug="${index}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    },
  };
})();
