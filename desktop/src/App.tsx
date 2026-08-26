import { useEffect, useRef, useState } from "react";
import {
  Search,
  Sparkles,
  X,
  ExternalLink,
  Minus,
  ArrowLeft,
  Volume2,
  BookOpen,
  Loader2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  fetchEasySenses,
  fetchSuggestions,
  lookupWord,
  type DictHomograph,
  type DictSense,
  type LookupResult,
} from "./lib/api.ts";
import { checkForAppUpdates } from "./lib/updates.ts";

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

export default function App() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [level, setLevel] = useState<"dict" | "easy">("dict");
  const [homoIndex, setHomoIndex] = useState(0);
  const [simplifying, setSimplifying] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  // 창 높이 동적 조절 (검색바 88px <-> 자동완성 400px <-> 결과 화면 620px)
  useEffect(() => {
    let targetHeight = 88;
    if (result && result.status === "ok") {
      targetHeight = 620;
    } else if (suggestions.length > 0) {
      targetHeight = Math.min(88 + suggestions.length * 46 + 25, 420);
    }
    invoke("resize_window", { height: targetHeight }).catch(() => {});
  }, [result, suggestions]);

  // 시작 시 업데이트 체크 및 자동 포커스
  useEffect(() => {
    checkForAppUpdates();
    inputRef.current?.focus();

    const unlisten = getCurrentWindow().listen("tauri://focus", () => {
      if (!result) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [result]);

  // ESC 키로 뒤로가기 또는 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (result) {
          setResult(null);
          inputRef.current?.focus();
        } else if (suggestions.length > 0) {
          setSuggestions([]);
        } else {
          getCurrentWindow().hide();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, suggestions]);

  // 실시간 초성/단어 자동완성 (결과 화면이 아닐 때만)
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    const trimmed = query.trim();
    if (!trimmed || result) {
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
  }, [query, result]);

  // "쉬운 말로" 모드 전환 시 비동기 변환
  useEffect(() => {
    if (level !== "easy" || result?.status !== "ok") return;
    const entry = result.entry;
    const homographs = entry.homographs && entry.homographs.length > 1 ? entry.homographs : null;
    const already = homographs ? homographs[homoIndex]?.easySenses : entry.easySenses;
    if (already) return;

    let cancelled = false;
    const w = entry.word;
    const idx = homoIndex;
    setSimplifying(true);
    fetchEasySenses(w, idx).then((easySenses) => {
      if (cancelled) return;
      setSimplifying(false);
      if (!easySenses) return;
      setResult((prev) => {
        if (prev?.status !== "ok" || prev.entry.word !== w) return prev;
        const nextEntry = { ...prev.entry };
        if (nextEntry.homographs && nextEntry.homographs.length > 1) {
          const hgs = [...nextEntry.homographs];
          hgs[idx] = { ...hgs[idx], easySenses };
          nextEntry.homographs = hgs;
          if (idx === 0) nextEntry.easySenses = easySenses;
        } else {
          nextEntry.easySenses = easySenses;
        }
        return { ...prev, entry: nextEntry };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [level, result, homoIndex]);

  // 낱말 검색: 성공 시 별도 화면으로 전환, 실패 시 토스트 표시
  async function submitSearch(wordToSearch: string) {
    const w = wordToSearch.trim();
    if (!w) return;

    setSuggestions([]);
    setLoading(true);

    try {
      const r = await lookupWord(w);
      setLoading(false);

      if (r.status === "ok") {
        setResult(r);
        setHomoIndex(0);
      } else {
        const msg =
          r.status === "blocked"
            ? "이 낱말은 찾을 수 없어요. 다른 낱말을 적어 볼까요?"
            : `‘${w}’(은)는 아직 준비 중인 낱말이에요.`;
        showToast(msg);
      }
    } catch {
      setLoading(false);
      showToast("연결 중 문제가 생겼어요. 다시 시도해 주세요.");
    }
  }

  // 검색 폼 제출 (초성 입력 시 자동 1순위 추천어로 스마트 연결)
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      submitSearch(suggestions[selectedIndex]);
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) return;

    // 초성만 입력한 경우 (예: "ㄷㄱ", "ㄱㅇ")
    if (isChoseongOnly(trimmed)) {
      if (suggestions.length > 0) {
        submitSearch(suggestions[0]);
        return;
      }
      setLoading(true);
      const list = await fetchSuggestions(trimmed);
      setLoading(false);
      if (list.length > 0) {
        submitSearch(list[0]);
        return;
      }
      showToast(`‘${trimmed}’ 초성에 맞는 낱말을 찾지 못했어요.`);
      return;
    }

    submitSearch(trimmed);
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

  function goBackToSearch() {
    setResult(null);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }

  function openCurrentInBrowser() {
    if (result && result.status === "ok") {
      openUrl(`https://dic.dgedu.link/${encodeURIComponent(result.entry.word)}`);
    } else {
      openUrl("https://dic.dgedu.link");
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col justify-start p-2 bg-transparent select-none">
      {/* 1. 검색 결과 별도 화면 */}
      {result && result.status === "ok" ? (
        <div className="flex h-[600px] flex-col overflow-hidden rounded-3xl border-2 border-brand-200 bg-white shadow-2xl animate-fade-in">
          {/* 상단 액션 바 */}
          <div
            data-tauri-drag-region
            className="flex shrink-0 items-center justify-between border-b border-line/60 bg-brand-50/80 px-4 py-2.5 cursor-move"
          >
            <button
              onClick={goBackToSearch}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-brand-700 bg-white hover:bg-brand-100 transition-colors shadow-xs cursor-pointer border border-brand-200"
            >
              <ArrowLeft className="size-3.5" />
              <span>검색으로 (ESC)</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openCurrentInBrowser}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-ink-soft hover:bg-white hover:text-brand-700 transition-colors cursor-pointer"
                title="웹에서 크게 보기"
              >
                <span>웹에서 크게</span>
                <ExternalLink className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => getCurrentWindow().hide()}
                className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-white hover:text-ink transition-colors cursor-pointer"
                title="트레이로 숨기기"
              >
                <Minus className="size-4" />
              </button>
            </div>
          </div>

          {/* 사전 상세 카드 영역 */}
          <div className="flex-1 overflow-y-auto p-5">
            <DedicatedResultCard
              entry={result.entry}
              level={level}
              onLevelChange={setLevel}
              homoIndex={homoIndex}
              onHomoIndexChange={setHomoIndex}
              simplifying={simplifying}
              onOpenWeb={openCurrentInBrowser}
            />
          </div>
        </div>
      ) : (
        /* 2. 스팟라이트 캡슐형 검색창 화면 */
        <div className="relative flex flex-col">
          <form
            onSubmit={handleFormSubmit}
            data-tauri-drag-region
            className="relative flex h-[68px] w-full items-center rounded-full border-2 border-brand-200 bg-white py-1.5 pl-6 pr-2 shadow-[var(--shadow-primary-soft)] focus-within:border-brand-500 transition-all cursor-move"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="궁금한 낱말이나 초성을 적어보세요 (예: ㄷㄱ, ㄱㅇ)"
              className="h-full min-w-0 flex-1 bg-transparent text-xl sm:text-2xl text-ink outline-none placeholder:text-ink-faint leading-normal"
            />

            {loading ? (
              <Loader2 className="mr-2 size-5 animate-spin text-brand-600" />
            ) : query ? (
              <button
                type="button"
                onClick={clearQuery}
                className="mr-1.5 grid size-7 place-items-center rounded-full text-ink-faint hover:bg-paper hover:text-ink transition-colors cursor-pointer"
                title="검색어 지우기"
              >
                <X className="size-4" />
              </button>
            ) : null}

            <div className="flex items-center gap-0.5 mr-1.5 text-ink-faint">
              <button
                type="button"
                onClick={() => openUrl("https://dic.dgedu.link")}
                className="grid size-8 place-items-center rounded-full hover:bg-paper hover:text-brand-700 transition-colors cursor-pointer"
                title="웹 사전 열기"
              >
                <ExternalLink className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => getCurrentWindow().hide()}
                className="grid size-8 place-items-center rounded-full hover:bg-paper hover:text-ink transition-colors cursor-pointer"
                title="트레이로 숨기기 (ESC)"
              >
                <Minus className="size-3.5" />
              </button>
            </div>

            {/* 오른쪽 원형 파란색 검색 버튼 */}
            <button
              type="submit"
              disabled={loading}
              aria-label="낱말 찾기"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Search className="size-5" aria-hidden />
            </button>
          </form>

          {/* 답이 없을 때 띄우는 플로팅 토스트 */}
          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-[78px] z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/90 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-sm animate-fade-in">
              {toast}
            </div>
          )}

          {/* 자동완성 드롭다운 */}
          {suggestions.length > 0 && !loading && (
            <div className="mt-2 overflow-hidden rounded-2xl border-2 border-brand-200 bg-white p-2 shadow-2xl animate-fade-in">
              <div className="mb-1 flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-600">
                <Sparkles className="size-3.5" />
                <span>추천 낱말 (Enter로 바로 보기)</span>
              </div>
              <div className="space-y-0.5">
                {suggestions.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item}
                      onClick={() => submitSearch(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-2 text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-brand-50 text-brand-700 font-bold" : "text-ink hover:bg-paper"
                      }`}
                    >
                      <span className="text-base font-semibold">{item}</span>
                      <span className="text-xs text-brand-600 font-medium opacity-80">사전 보기 &rarr;</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 결과 전용 화면 컴포넌트
function DedicatedResultCard({
  entry,
  level,
  onLevelChange,
  homoIndex,
  onHomoIndexChange,
  simplifying,
  onOpenWeb,
}: {
  entry: DictHomograph extends never ? never : any;
  level: "dict" | "easy";
  onLevelChange: (lv: "dict" | "easy") => void;
  homoIndex: number;
  onHomoIndexChange: (i: number) => void;
  simplifying: boolean;
  onOpenWeb: () => void;
}) {
  const homographs: DictHomograph[] =
    entry.homographs && entry.homographs.length > 1
      ? entry.homographs
      : [{ pos: entry.pos, level: entry.level, senses: entry.senses, image: entry.image, audio: entry.audio, easySenses: entry.easySenses }];
  const safeIndex = homoIndex < homographs.length ? homoIndex : 0;
  const active = homographs[safeIndex] ?? homographs[0];

  const usingEasy = level === "easy" && !!active.easySenses;
  const senses: DictSense[] = usingEasy ? active.easySenses! : active.senses;
  const primary = senses[0];
  const rest = senses.slice(1);

  const playAudio = () => {
    if (active.audio?.url) {
      new Audio(active.audio.url).play().catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      {/* 낱말 헤더: 표제어, 발음, 품사, 쉬운말 토글 */}
      <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-ink">{entry.word}</h1>
            {active.audio ? (
              <button
                type="button"
                onClick={playAudio}
                className="grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors cursor-pointer"
                title="발음 듣기"
              >
                <Volume2 className="size-5" />
              </button>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-ink-faint">
            {entry.reading ? <span>[{entry.reading}]</span> : null}
            {active.pos ? <span className="rounded-full bg-paper px-2 py-0.5">{active.pos}</span> : null}
            {active.level ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{active.level}</span> : null}
          </div>
        </div>

        {/* 쉬운 말로 / 사전 원문 토글 */}
        <div className="flex items-center gap-1 rounded-full bg-paper p-1 border border-line">
          <button
            onClick={() => onLevelChange("dict")}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
              level === "dict" ? "bg-white text-brand-700 shadow-xs" : "text-ink-faint hover:text-ink"
            }`}
          >
            <BookOpen className="size-3" />
            <span>사전 원문</span>
          </button>
          <button
            onClick={() => onLevelChange("easy")}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
              level === "easy" ? "bg-white text-brand-700 shadow-xs" : "text-ink-faint hover:text-ink"
            }`}
          >
            <Sparkles className="size-3" />
            <span>쉬운 말로</span>
          </button>
        </div>
      </div>

      {/* 동음이의어 전환 탭 */}
      {homographs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {homographs.map((h, i) => {
            const preview = h.senses[0]?.def ?? "";
            const short = preview.length > 12 ? `${preview.slice(0, 12)}…` : preview;
            return (
              <button
                key={i}
                onClick={() => onHomoIndexChange(i)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  i === safeIndex
                    ? "border-brand-500 bg-brand-50 text-brand-700 font-bold"
                    : "border-line bg-white text-ink-soft hover:bg-paper"
                }`}
              >
                <span className="mr-1 text-brand-600 font-bold">{i + 1}</span>
                {short}
              </button>
            );
          })}
        </div>
      )}

      {/* 뜻풀이 및 그림 영역 */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-3">
          {level === "easy" && !usingEasy && simplifying ? (
            <p className="text-xs text-brand-600 font-medium animate-pulse">쉬운 말로 바꾸는 중…</p>
          ) : null}

          {primary && (
            <p className="text-2xl font-extrabold leading-relaxed text-ink">{primary.def}</p>
          )}

          {primary?.example && (
            <div className="rounded-2xl border border-line/60 bg-paper/80 p-3.5 text-base">
              <div className="flex items-start gap-2">
                <span className="shrink-0 font-bold text-brand-700 mt-0.5">예문</span>
                <span className="text-ink-soft whitespace-pre-line leading-relaxed">
                  <HighlightWord text={primary.example} word={entry.word} />
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-ink-faint">
              {entry.source === "encykorea" ? "출처: 한국민족문화대백과사전" : "출처: 국립국어원 한국어기초사전"}
            </span>
            <button
              onClick={onOpenWeb}
              className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 cursor-pointer"
            >
              <span>웹에서 크게 보기</span>
              <ExternalLink className="size-3" />
            </button>
          </div>

          {rest.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-bold text-brand-600">다른 뜻 더 보기 ({rest.length})</summary>
              <ul className="mt-2 space-y-2">
                {rest.map((s, idx) => (
                  <li key={idx} className="rounded-lg bg-paper p-2.5 text-ink-soft">
                    <div className="font-medium text-ink">
                      <span className="font-bold mr-1">{idx + 2}.</span>
                      <span>{s.def}</span>
                    </div>
                    {s.example ? (
                      <div className="mt-1.5 flex items-start gap-1 text-xs text-ink-soft">
                        <span className="shrink-0 font-semibold text-brand-600 mr-0.5">예:</span>
                        <span className="whitespace-pre-line leading-relaxed">
                          <HighlightWord text={s.example} word={entry.word} />
                        </span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* 관련 사진/삽화 */}
        {active.image ? (
          <div className="size-48 shrink-0 overflow-hidden rounded-2xl border border-line bg-paper">
            <img src={active.image.url} alt={`${entry.word} 그림`} className="size-full object-contain" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HighlightWord({ text, word }: { text: string; word: string }) {
  const cleanWord = word.replace(/[0-9]/g, "").trim();
  if (!cleanWord || !text) return <span>{text}</span>;

  const regex = new RegExp(`(${cleanWord})`, "g");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        part === cleanWord ? (
          <mark key={i} className="rounded-md bg-amber-100 text-amber-950 font-bold px-1.5 py-0.5 shadow-xs">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
