import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Printer, Shuffle, X } from "lucide-react";
import { peekLookup } from "../lib/api.ts";
import type { WordSet } from "../lib/words.ts";

interface Props {
  set: WordSet | null; // null이면 닫힘
  mode: "cards" | "print";
  onModeChange: (m: "cards" | "print") => void;
  onClose: () => void;
}

interface Meaning {
  pos?: string;
  def?: string;
  example?: string;
  source?: string;
}

const SOURCE_NAME: Record<string, string> = {
  krdict: "한국어기초사전",
  stdict: "표준국어대사전",
  encykorea: "한국민족문화대백과사전",
};

// 낱말장 카드 익히기·인쇄(D28 S5). 뜻은 기존 조회 API에서 받되 인기 집계에는 넣지 않는다(peekLookup).
export default function WordbookStudy({ set, mode, onModeChange, onClose }: Props) {
  const [meanings, setMeanings] = useState<Record<string, Meaning | null>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!set) return;
    setOrder(set.words);
    setIdx(0);
    setRevealed(false);
    setMeanings({});
    let cancelled = false;
    // 낱말이 많아도 한꺼번에 몰리지 않게 셋씩
    const queue = [...set.words];
    const worker = async () => {
      while (queue.length && !cancelled) {
        const w = queue.shift()!;
        const r = await peekLookup(w);
        if (cancelled) return;
        const m: Meaning | null =
          r.status === "ok"
            ? { pos: r.entry.pos, def: r.entry.senses[0]?.def, example: r.entry.senses[0]?.example, source: r.entry.source }
            : null;
        setMeanings((cur) => ({ ...cur, [w]: m }));
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [set]);

  const move = useCallback(
    (d: number) => {
      setIdx((i) => Math.min(Math.max(i + d, 0), Math.max(order.length - 1, 0)));
      setRevealed(false);
    },
    [order.length],
  );

  useEffect(() => {
    if (!set || mode !== "cards") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealed((r) => !r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set, mode, move, onClose]);

  // 인쇄 때 뒤의 앱 화면을 감추려고(styles/tokens.css @media print) body에 표시를 단다.
  useEffect(() => {
    if (!set) return;
    document.body.classList.add("wordbook-open");
    return () => document.body.classList.remove("wordbook-open");
  }, [set]);

  if (!set) return null;
  const word = order[idx];
  const m = word ? meanings[word] : undefined;
  const sources = [...new Set(Object.values(meanings).map((x) => x?.source).filter(Boolean) as string[])]
    .map((s) => SOURCE_NAME[s] ?? s)
    .join("·");

  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-white text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink-soft"
    }`;

  return createPortal(
    <div className="wordbook-portal fixed inset-0 z-50 overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label={`${set.title} 낱말장`}>
      <div className="no-print sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <p className="mr-auto text-lg font-extrabold text-ink">
            {set.emoji} {set.title}
          </p>
          <div className="flex gap-1 rounded-full bg-paper p-1" role="tablist" aria-label="보기">
            <button role="tab" aria-selected={mode === "cards"} onClick={() => onModeChange("cards")} className={tab(mode === "cards")}>
              카드 익히기
            </button>
            <button role="tab" aria-selected={mode === "print"} onClick={() => onModeChange("print")} className={tab(mode === "print")}>
              인쇄
            </button>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-ink-faint hover:bg-paper hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {mode === "cards" ? (
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10">
          <p className="mb-4 text-sm font-semibold text-ink-faint">
            {idx + 1} / {order.length}
          </p>
          <button
            onClick={() => setRevealed((r) => !r)}
            className="flex min-h-[50vh] w-full flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-8 text-center transition-colors hover:border-brand-200"
            aria-live="polite"
          >
            <span className="text-5xl font-extrabold text-ink sm:text-6xl">{word}</span>
            {revealed ? (
              m === undefined ? (
                <span className="mt-8 text-lg text-ink-faint">뜻을 불러오는 중…</span>
              ) : m?.def ? (
                <>
                  {m.pos ? <span className="mt-6 text-sm font-semibold text-ink-faint">{m.pos}</span> : null}
                  <span className="mt-3 max-w-xl text-2xl font-semibold leading-relaxed text-ink">{m.def}</span>
                  {m.example ? <span className="mt-4 max-w-xl text-lg text-ink-soft">예) {m.example}</span> : null}
                </>
              ) : (
                <span className="mt-8 text-lg text-ink-faint">아직 뜻풀이가 준비되지 않은 낱말이에요.</span>
              )
            ) : (
              <span className="mt-8 text-base text-ink-faint">뜻을 떠올려 보고 눌러 보세요</span>
            )}
          </button>
          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={() => move(-1)}
              disabled={idx === 0}
              className="flex items-center gap-1 rounded-full border border-line px-5 py-2.5 font-semibold text-ink-soft hover:bg-paper disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden /> 앞
            </button>
            <button
              onClick={() => {
                setOrder((o) => [...o].sort(() => Math.random() - 0.5));
                setIdx(0);
                setRevealed(false);
              }}
              className="flex items-center gap-1 rounded-full border border-line px-5 py-2.5 font-semibold text-ink-soft hover:bg-paper"
            >
              <Shuffle className="size-4" aria-hidden /> 섞기
            </button>
            <button
              onClick={() => move(1)}
              disabled={idx >= order.length - 1}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              다음 <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-faint">카드를 누르거나 띄어쓰기 키로 뜻을 보고, 화살표 키로 넘겨요.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="no-print mb-6 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">A4 종이에 낱말·뜻과 문장 쓰는 줄이 나와요.</p>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              <Printer className="size-4" aria-hidden /> 인쇄하기
            </button>
          </div>
          <div className="print-area">
            <h2 className="text-2xl font-extrabold text-ink">
              {set.emoji} {set.title}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">이름: ____________________</p>
            <table className="mt-5 w-full border-collapse text-left">
              <thead>
                <tr className="border-y-2 border-ink/70 text-sm">
                  <th className="w-[22%] px-2 py-2">낱말</th>
                  <th className="w-[43%] px-2 py-2">뜻</th>
                  <th className="px-2 py-2">내가 만든 문장</th>
                </tr>
              </thead>
              <tbody>
                {set.words.map((w) => {
                  const mm = meanings[w];
                  return (
                    <tr key={w} className="break-inside-avoid border-b border-line align-top">
                      <td className="px-2 py-3 text-lg font-bold text-ink">{w}</td>
                      <td className="px-2 py-3 text-sm leading-relaxed text-ink">
                        {mm === undefined ? <span className="text-ink-faint">불러오는 중…</span> : mm?.def ?? ""}
                      </td>
                      <td className="px-2 py-3">
                        <div className="mt-5 border-b border-dashed border-ink-faint" />
                        <div className="mt-6 border-b border-dashed border-ink-faint" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-ink-faint">
              어린이 쉬운 사전(dic.dgedu.link){sources ? ` · 뜻풀이: 국립국어원 ${sources}` : ""}
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
