import { ChevronRight } from "lucide-react";
import { prefetchProps } from "../lib/prefetch.ts";

interface Props {
  title: string;
  emoji?: string;
  words: string[];
  onPick: (word: string) => void;
  emptyText?: string;
  onClear?: () => void;
  layout?: "wrap" | "list"; // list = 세로 목록(줄마다 낱말 1개), wrap = 여러 줄로 자동 줄바꿈되는 칩
  max?: number; // 넘는 개수는 자르고(잘렸다는 티는 안 냄)
  onGoto?: () => void; // 있으면 제목 옆에 ">" 아이콘 — "나의 낱말사전"으로 이동(탭 구분 없음)
}

// 낱말 섹션(내가 찾은 / 즐겨찾기한 / 자주 찾는 / 추천). 항목을 누르면 바로 그 낱말로 검색.
export default function WordChips({ title, emoji, words, onPick, emptyText, onClear, layout = "wrap", max, onGoto }: Props) {
  const shown = max ? words.slice(0, max) : words;
  return (
    <section className="w-full">
      {title ? (
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onGoto}
            disabled={!onGoto}
            className={`flex items-center gap-1 text-base font-extrabold text-ink-soft ${onGoto ? "hover:text-ink" : ""}`}
          >
            {emoji ? <span className="mr-1.5">{emoji}</span> : null}
            {title}
            {onGoto ? <ChevronRight className="size-4 text-ink-faint" aria-hidden /> : null}
          </button>
          {onClear && shown.length > 0 ? (
            <button onClick={onClear} className="text-xs text-ink-faint hover:text-ink-soft transition-colors">
              지우기
            </button>
          ) : null}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-ink-faint">{emptyText ?? "아직 없어요."}</p>
      ) : layout === "list" ? (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {shown.map((w) => (
            <button
              key={w}
              onClick={() => onPick(w)}
              {...prefetchProps(w)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-base font-semibold text-ink hover:bg-paper transition-colors"
            >
              {w}
              <ChevronRight className="size-4 text-ink-faint" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {shown.map((w) => (
            <button
              key={w}
              onClick={() => onPick(w)}
              {...prefetchProps(w)}
              className="word-chip rounded-full border border-line bg-white px-4 py-2 text-base font-semibold text-ink"
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
