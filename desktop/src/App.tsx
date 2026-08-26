import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, X, Minus, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fetchSuggestions } from "./lib/api.ts";
import { checkForAppUpdates } from "./lib/updates.ts";

export default function App() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 자동완성 목록 유무에 따른 스팟라이트 창 크기 동적 조절 (단일 바 68px <-> 자동완성 확장 280px)
  useEffect(() => {
    let targetHeight = 68;
    if (suggestions.length > 0) {
      targetHeight = Math.min(68 + suggestions.length * 44 + 20, 360);
    }
    invoke("resize_window", { height: targetHeight }).catch(() => {});
  }, [suggestions]);

  // 시작 시 업데이트 체크 및 자동 포커스
  useEffect(() => {
    checkForAppUpdates();
    inputRef.current?.focus();

    // 창이 다시 표시될 때 자동 포커스 및 검색창 초기화
    const unlisten = getCurrentWindow().listen("tauri://focus", () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // ESC 키로 닫기/숨기기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (suggestions.length > 0) {
          setSuggestions([]);
        } else {
          getCurrentWindow().hide();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [suggestions]);

  // 디바운스된 실시간 초성/단어 자동완성
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const list = await fetchSuggestions(trimmed);
      setSuggestions(list);
      setSelectedIndex(-1);
    }, 100);

    return () => clearTimeout(debounceTimer.current);
  }, [query]);

  // 낱말 검색 시: 웹 사전에서 크게 뜻풀이·예문·사진이 나오도록 브라우저 열기 후 스팟라이트 창 닫기
  async function submitSearch(wordToSearch: string) {
    const w = wordToSearch.trim();
    if (!w) return;

    // 브라우저로 큰 화면 결과 즉시 열기
    await openUrl(`https://dic.dgedu.link/${encodeURIComponent(w)}`).catch(() => {});

    // 스팟라이트 바 상태 정리 및 백그라운드 숨김
    setQuery("");
    setSuggestions([]);
    setSelectedIndex(-1);
    await getCurrentWindow().hide().catch(() => {});
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      submitSearch(suggestions[selectedIndex]);
      return;
    }
    if (query.trim()) {
      submitSearch(query);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    }
  }

  function clearQuery() {
    setQuery("");
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }

  function hideWindow() {
    getCurrentWindow().hide();
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border-2 border-brand-300 bg-white/95 shadow-2xl backdrop-blur-xl">
      {/* 컴팩트 스팟라이트 검색창 */}
      <div
        data-tauri-drag-region
        className="flex h-[64px] shrink-0 items-center justify-between px-4 cursor-move bg-gradient-to-r from-brand-50/80 to-white/90"
      >
        <form onSubmit={handleFormSubmit} className="flex flex-1 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white shadow-xs">
            <Search className="size-5" />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="궁금한 낱말이나 초성을 적어보세요 (예: ㄱㅇ)"
            className="flex-1 bg-transparent text-xl font-bold text-ink outline-none placeholder:text-ink-faint placeholder:font-normal placeholder:text-base"
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              className="grid size-7 place-items-center rounded-full text-ink-faint hover:bg-paper hover:text-ink transition-colors"
              title="지우기"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>

        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => openUrl("https://dic.dgedu.link")}
            className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-white hover:text-brand-700 transition-colors"
            title="웹 사전 열기"
          >
            <ExternalLink className="size-4" />
          </button>
          <button
            type="button"
            onClick={hideWindow}
            className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-white hover:text-ink transition-colors"
            title="트레이로 숨기기 (ESC)"
          >
            <Minus className="size-4" />
          </button>
        </div>
      </div>

      {/* 실시간 자동완성 제안 목록 */}
      {suggestions.length > 0 && (
        <div className="flex-1 overflow-y-auto border-t border-line/60 p-2 bg-white/95">
          <div className="mb-1.5 flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-700">
            <Sparkles className="size-3.5" />
            <span>추천 낱말 (Enter를 누르면 큰 화면으로 열려요)</span>
          </div>
          <div className="space-y-1">
            {suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item}
                  onClick={() => submitSearch(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-2 text-left transition-colors ${
                    isSelected ? "bg-brand-50 text-brand-700 font-bold" : "text-ink hover:bg-paper"
                  }`}
                >
                  <span className="text-base font-semibold">{item}</span>
                  <span className="text-xs text-brand-600 font-medium">크게 보기 &rarr;</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
