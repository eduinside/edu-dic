import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

interface Props {
  onSearch: (word: string) => void;
  initial?: string;
  big?: boolean; // 홈에서는 크게, 결과 상단에서는 조금 작게
  autoFocus?: boolean;
}

// 네이버 사전 첫 화면처럼 크고 뚜렷한 검색창. 진입 즉시 자동 포커스(핵심 원칙 ★).
export default function SearchBox({ onSearch, initial = "", big = false, autoFocus = true }: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const w = value.trim();
    if (w) onSearch(w);
  }

  return (
    <form onSubmit={submit} className="w-full" role="search">
      <div
        className={`flex items-center rounded-full border-2 border-brand-200 bg-white shadow-[var(--shadow-primary-soft)] focus-within:border-brand-500 transition-colors ${
          big ? "py-2 pl-6 pr-2" : "py-1.5 pl-5 pr-1.5"
        }`}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="search"
          inputMode="text"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="궁금한 낱말을 적어 보세요"
          aria-label="낱말 검색"
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint text-ink ${
            big ? "text-2xl sm:text-3xl" : "text-lg"
          }`}
        />
        {/* 네이버 사전 첫 화면처럼 원형 아이콘 버튼 — 텍스트 라벨이 없어 좁은 화면에서도 밀려나지 않는다. */}
        <button
          type="submit"
          aria-label="낱말 찾기"
          className={`ml-2 grid shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 transition-colors ${
            big ? "size-14" : "size-10"
          }`}
        >
          <Search className={big ? "size-6" : "size-4"} aria-hidden />
        </button>
      </div>
    </form>
  );
}
