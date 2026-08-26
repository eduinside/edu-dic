import { useEffect, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { fetchSuggestions } from "../lib/api.ts";

interface Props {
  onSearch: (word: string) => void;
  initial?: string;
  big?: boolean; // 홈에서는 크게, 결과 상단에서는 조금 작게
  autoFocus?: boolean;
}

export default function SearchBox({ onSearch, initial = "", big = false, autoFocus = true }: Props) {
  const [value, setValue] = useState(initial);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setValue(initial);
    setIsOpen(false);
    setSuggestions([]);
  }, [initial]);

  // 디바운스된 자동완성 제안 호출
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const list = await fetchSuggestions(trimmed);
      if (list.length > 0) {
        setSuggestions(list);
        setIsOpen(true);
        setSelectedIndex(-1);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 120);

    return () => clearTimeout(debounceTimer.current);
  }, [value, initial]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleSelect(word: string) {
    setValue(word);
    setIsOpen(false);
    setSuggestions([]);
    inputRef.current?.blur();
    onSearch(word);
  }

  const CHOSEONG_LIST = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
  ];

  function isChoseongOnly(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed) return false;
    for (let i = 0; i < trimmed.length; i++) {
      if (!CHOSEONG_LIST.includes(trimmed[i])) return false;
    }
    return true;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isOpen && selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelect(suggestions[selectedIndex]);
      return;
    }
    const w = value.trim();
    if (w) {
      if (isChoseongOnly(w) && suggestions.length > 0) {
        handleSelect(suggestions[0]);
        return;
      }
      setIsOpen(false);
      setSuggestions([]);
      inputRef.current?.blur();
      onSearch(w);
    }
  }


  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={submit} className="w-full" role="search">
        <div
          className={`relative flex items-center rounded-full border-2 border-brand-200 bg-white shadow-[var(--shadow-primary-soft)] focus-within:border-brand-500 focus-within:shadow-[var(--shadow-primary-glow)] transition-all ${
            big ? "py-2 pl-6 pr-2" : "py-1.5 pl-4 pr-1.5"
          }`}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            type="search"
            inputMode="text"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={big ? "궁금한 낱말이나 초성을 적어보세요 (예: ㄱㅇ, 바다)" : "궁금한 낱말이나 초성을 적어보세요"}
            aria-label="낱말 검색"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint text-ink ${
              big ? "text-2xl sm:text-3xl" : "text-base sm:text-lg"
            }`}
          />

          <button
            type="submit"
            aria-label="낱말 찾기"
            className={`ml-2 grid shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 transition-transform active:scale-95 ${
              big ? "size-14" : "size-10"
            }`}
          >
            <Search className={big ? "size-6" : "size-4"} aria-hidden />
          </button>
        </div>
      </form>

      {/* 자동완성 드롭다운 (10~20개 유연 지원) */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-brand-200 bg-white/95 backdrop-blur-md p-2 shadow-2xl animate-fade-in">
          <div className="mb-1 flex items-center justify-between px-3 py-1 text-xs font-bold text-brand-600 border-b border-line/40 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" aria-hidden />
              <span>추천 낱말 ({suggestions.length})</span>
            </div>
            <span className="text-[11px] text-ink-faint font-normal">Enter로 바로 보기</span>
          </div>
          <ul role="listbox" className="space-y-1 max-h-[360px] sm:max-h-[440px] overflow-y-auto overscroll-contain pr-1">
            {suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <li
                  key={item}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 transition-colors ${
                    isSelected ? "bg-brand-50 text-brand-700 font-bold" : "text-ink hover:bg-paper"
                  } ${big ? "text-lg" : "text-base"}`}
                >
                  <span>{item}</span>
                  <span className="text-xs font-semibold text-ink-faint opacity-60">&rarr;</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
