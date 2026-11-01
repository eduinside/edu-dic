import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Plus, RefreshCw, Search, X } from "lucide-react";
import { matchesChoseongOrPrefix } from "../../functions/lib/choseong.ts";
import { prefetchProps } from "../lib/prefetch.ts";
import {
  FIRST_SOUNDS,
  SUNWOORI_SOURCE_NAME,
  firstSound,
  loadSunwoori,
  postUrl,
  randomSunwoori,
  todayLabel,
  todaySunwoori,
  type SunwooriData,
} from "../lib/sunwoori.ts";

interface Props {
  onSearch: (w: string) => void;
  onBack: () => void;
  selected: string[];
  onToggleSelect: (w: string) => void;
  onClearSelection: () => void;
  onOpenWordbook: () => void; // 고른 낱말로 낱말장 만들기/넣기 창 열기
}

const PAGE = 48;

// 순우리말 배움터(/uri, D28). 낱말을 찾아 누르면 기존 결과 화면으로, 상자를 누르면 낱말장에 담을 낱말로 고른다.
// 소개말은 싣지 않고 원문(한글사랑관)으로 보낸다 — docs/plan-sunwoori.md §1.1.
export default function UriPage({ onSearch, onBack, selected, onToggleSelect, onClearSelection, onOpenWordbook }: Props) {
  const [data, setData] = useState<SunwooriData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [sound, setSound] = useState<string | null>(null);
  const [easyOnly, setEasyOnly] = useState(false);
  const [sort, setSort] = useState<"new" | "abc">("new");
  const [shown, setShown] = useState(PAGE);
  const [pick, setPick] = useState<string | null>(null); // '다른 낱말'로 고른 낱말(없으면 오늘의 낱말)

  useEffect(() => {
    loadSunwoori().then(setData, () => setFailed(true));
  }, []);

  useEffect(() => setShown(PAGE), [query, sound, easyOnly, sort]);

  // 기초사전 대조를 아직 못 한 목록이면(kr가 전부 null) '쉬운 낱말' 고르기를 숨긴다.
  const canFilterEasy = !!data?.words.some((x) => x.kr !== null);
  const featuredWord = pick ?? todaySunwoori();
  const latest = featuredWord ? data?.words.find((x) => x.w === featuredWord) : undefined;

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    const out = data.words.filter(
      (x) =>
        (!q || matchesChoseongOrPrefix(x.w, q)) &&
        (!sound || firstSound(x.w) === sound) &&
        (!easyOnly || x.kr === true),
    );
    return sort === "abc" ? [...out].sort((a, b) => a.w.localeCompare(b.w, "ko")) : out;
  }, [data, query, sound, easyOnly, sort]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-soft hover:border-brand-200"
    }`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-32">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> 뒤로
      </button>
      <h1 className="text-2xl font-extrabold text-ink">🌱 순우리말 배움터</h1>
      <p className="mt-1.5 text-ink-soft">오래전부터 써 온 고운 우리말을 찾아보고, 마음에 드는 낱말을 낱말장에 모아 보세요.</p>

      {latest ? (
        <section className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl border border-brand-200 bg-brand-50/60 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-700">{pick ? "골라 본 순우리말" : `오늘의 순우리말 · ${todayLabel()}`}</p>
            <p className="mt-1 text-3xl font-extrabold text-ink sm:text-4xl">{latest.w}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onSearch(latest.w)}
              {...prefetchProps(latest.w)}
              className="rounded-full bg-brand-600 px-5 py-2.5 text-base font-bold text-white hover:bg-brand-700"
            >
              뜻 보기
            </button>
            <SelectButton word={latest.w} selected={selected.includes(latest.w)} onToggle={onToggleSelect} withLabel />
            <a
              href={postUrl(latest.no)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper"
            >
              소개 글 <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <button
              onClick={() => setPick(randomSunwoori(latest.w))}
              className="flex items-center gap-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper"
            >
              <RefreshCw className="size-3.5" aria-hidden /> 다른 낱말
            </button>
          </div>
        </section>
      ) : null}

      {/* 찾기 */}
      <div className="mt-8 space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="순우리말 찾기 (초성도 돼요)"
            aria-label="순우리말 안에서 찾기"
            className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-10 text-base text-ink outline-none focus:border-brand-400"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="찾는 말 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canFilterEasy ? (
            <>
              <button onClick={() => setEasyOnly(true)} aria-pressed={easyOnly} className={chip(easyOnly)}>
                쉬운 낱말
              </button>
              <button onClick={() => setEasyOnly(false)} aria-pressed={!easyOnly} className={chip(!easyOnly)}>
                모든 낱말
              </button>
              <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            </>
          ) : null}
          <button onClick={() => setSort("new")} aria-pressed={sort === "new"} className={chip(sort === "new")}>
            새로 나온 차례
          </button>
          <button onClick={() => setSort("abc")} aria-pressed={sort === "abc"} className={chip(sort === "abc")}>
            가나다 차례
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="첫 글자">
          <button onClick={() => setSound(null)} aria-pressed={sound === null} className={chip(sound === null)}>
            전체
          </button>
          {FIRST_SOUNDS.map((s) => (
            <button key={s} onClick={() => setSound(sound === s ? null : s)} aria-pressed={sound === s} className={`${chip(sound === s)} min-w-10`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      {failed ? (
        <p className="mt-8 text-ink-soft">목록을 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.</p>
      ) : !data ? (
        <p className="mt-8 text-ink-faint" role="status">
          목록을 불러오는 중…
        </p>
      ) : (
        <>
          <p className="mt-6 mb-3 text-sm font-semibold text-ink-faint">낱말 {list.length}개</p>
          {list.length === 0 ? (
            <p className="text-ink-soft">찾는 낱말이 목록에 없어요. 위 검색창의 말을 바꿔 볼까요?</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {list.slice(0, shown).map((x) => (
                <li key={x.w} className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-white">
                  <button
                    onClick={() => onSearch(x.w)}
                    {...prefetchProps(x.w)}
                    className="min-w-0 flex-1 px-3 py-3 text-left hover:bg-paper transition-colors sm:px-4"
                  >
                    <span className="block text-base font-bold text-ink sm:text-lg">{x.w}</span>
                    <span className="block text-xs text-ink-faint">{x.pos ?? " "}</span>
                  </button>
                  <SelectButton word={x.w} selected={selected.includes(x.w)} onToggle={onToggleSelect} />
                </li>
              ))}
            </ul>
          )}
          {list.length > shown ? (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-bold text-ink-soft hover:bg-paper"
              >
                {list.length - shown}개 더 보기
              </button>
            </div>
          ) : null}
          <p className="mt-10 text-xs leading-relaxed text-ink-faint">
            낱말 목록 출처:{" "}
            <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-soft">
              {SUNWOORI_SOURCE_NAME} '순우리말'
            </a>{" "}
            (소개 글은 원문에서 볼 수 있어요) · 뜻풀이: 국립국어원 한국어기초사전·표준국어대사전 · 목록 갱신{" "}
            {data.updated}
          </p>
        </>
      )}

      {/* 고른 낱말이 있으면 아래에 떠 있는 줄 */}
      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
            <p className="mr-auto text-base font-bold text-ink">{selected.length}개 골랐어요</p>
            <button onClick={onClearSelection} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-paper">
              모두 빼기
            </button>
            <button onClick={onOpenWordbook} className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">
              낱말장에 담기
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SelectButton({
  word,
  selected,
  onToggle,
  withLabel,
}: {
  word: string;
  selected: boolean;
  onToggle: (w: string) => void;
  withLabel?: boolean;
}) {
  const label = selected ? `${word} 빼기` : `${word} 고르기`;
  if (withLabel) {
    return (
      <button
        onClick={() => onToggle(word)}
        aria-pressed={selected}
        aria-label={label}
        className={`flex items-center gap-1 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors ${
          selected ? "border-brand-500 bg-brand-600 text-white" : "border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
        }`}
      >
        {selected ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        {selected ? "골랐어요" : "고르기"}
      </button>
    );
  }
  return (
    <button
      onClick={() => onToggle(word)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`flex w-10 shrink-0 items-center justify-center border-l transition-colors sm:w-12 ${
        selected ? "border-brand-500 bg-brand-600 text-white" : "border-line text-ink-faint hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {selected ? <Check className="size-5" aria-hidden /> : <Plus className="size-5" aria-hidden />}
    </button>
  );
}
