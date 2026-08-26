import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Home, Sparkles, BookMarked, BookOpen, ArrowLeft, ChevronDown, Settings2, X, Info } from "lucide-react";
import SearchBox from "./components/SearchBox.tsx";
import WordChips from "./components/WordChips.tsx";
import ResultCard from "./components/ResultCard.tsx";
import ResourceLinks from "./components/ResourceLinks.tsx";
import UsageGuide from "./components/UsageGuide.tsx";
import { fetchEasySenses, fetchPopular, fetchRelated, lookupWord } from "./lib/api.ts";
import { relatedWords, WORD_SETS, type WordSet } from "./lib/words.ts";
import * as store from "./lib/storage.ts";
import type { DictSense, LookupResult, ReadingLevel } from "./types.ts";

const LANDING_PREVIEW_MAX = 8; // 랜딩 4열 각각 최대 개수(D23)
const DEFAULT_TOPICS = ["nature-season", "school-life", "feelings-emotions"]; // 낱말 익히기 기본 노출 주제 3개
const MYWORDS_PATH = "my"; // "나의 낱말사전" 전용 URL(D27) — 검색어 경로(/나비)와 겹치지 않게 예약.

// 주소 경로를 해석한다. /my 는 예약 경로(D27), 그 외 비어있지 않은 경로는 검색어(/나비, D18).
// 과거에 공유된 ?q= 링크도 계속 동작하도록 폴백으로 남겨 둔다.
type RouteInfo = { kind: "mywords"; tab: MyWordsTab | null } | { kind: "word"; word: string } | { kind: "home" };
function routeFromLocation(): RouteInfo {
  const path = decodeURIComponent(window.location.pathname.replace(/^\/+/, "")).trim();
  if (path === MYWORDS_PATH) {
    const tab = new URLSearchParams(window.location.search).get("tab") as MyWordsTab | null;
    return { kind: "mywords", tab: tab && ["recent", "myPopular", "favorite"].includes(tab) ? tab : null };
  }
  if (path) return { kind: "word", word: path };
  const q = new URLSearchParams(window.location.search).get("q")?.trim();
  if (q) return { kind: "word", word: q };
  return { kind: "home" };
}

type Page = "home" | "mywords";
type MyWordsTab = "recent" | "myPopular" | "favorite";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [myWordsTab, setMyWordsTab] = useState<MyWordsTab>("recent");
  const [word, setWord] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [longLoading, setLongLoading] = useState(false); // 1.2초 넘게 걸리면 안내 문구(D28)
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]); // 전역(다른 사용자, 최근 30일) — 랜딩용
  const [myPopular, setMyPopular] = useState<string[]>([]); // 개인(전체기간) — 나의 낱말사전용, D26
  const [big, setBig] = useState(false);
  const [level, setLevel] = useState<ReadingLevel>("dict");
  const [simplifying, setSimplifying] = useState(false);
  const [aiRelated, setAiRelated] = useState<string[]>([]);
  const [homoIndex, setHomoIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const requestSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);

  const search = useCallback(async (w: string, opts: { pushUrl?: boolean } = {}) => {
    const q = w.trim();
    if (!q) return;
    const { pushUrl = true } = opts;
    const seq = ++requestSeq.current;
    setPage("home");
    setWord(q);
    setLoading(true);
    setLongLoading(false);
    setResult(null);
    setAiRelated([]);
    setHomoIndex(0);
    if (pushUrl) {
      window.history.pushState({ q }, "", `/${encodeURIComponent(q)}`);
    }
    // 캐시 HIT는 순식간이라 이 문구가 안 보인다 — 처음 찾는 낱말(krdict 실호출)일 때만 뒤늦게 뜬다.
    const longTimer = setTimeout(() => {
      if (seq === requestSeq.current) setLongLoading(true);
    }, 1200);
    const r = await lookupWord(q);
    clearTimeout(longTimer);
    if (seq !== requestSeq.current) return; // 그 사이 다른 낱말을 검색했으면 이 결과는 버린다
    setResult(r);
    setLoading(false);
    setLongLoading(false);
    // 답을 찾은 낱말만 "내가 찾은/자주 찾은"에 남긴다 — 오타·미수록 낱말이 기록에 끼면 안 됨.
    if (r.status === "ok") {
      setRecent(store.pushRecent(q));
      store.bumpSearchCount(q);
      setMyPopular(store.getMostSearched());
    }
  }, []);

  const goHome = useCallback((pushUrl = true) => {
    requestSeq.current++; // 진행 중이던 요청 결과를 무효화
    setPage("home");
    setResult(null);
    setWord("");
    setLoading(false);
    setAiRelated([]);
    if (pushUrl) window.history.pushState({}, "", "/");
  }, []);

  const openMyWords = useCallback((tab: MyWordsTab, pushUrl = true) => {
    setMyWordsTab(tab);
    setPage("mywords");
    if (pushUrl) window.history.pushState({}, "", `/${MYWORDS_PATH}?tab=${tab}`);
  }, []);

  useEffect(() => {
    setRecent(store.getRecent());
    setFavorites(store.getFavorites());
    setMyPopular(store.getMostSearched());
    const s = store.getSettings();
    setBig(s.bigMode ?? false);
    setLevel(s.level ?? "dict");
    fetchPopular().then(setPopular);

    const applyRoute = (r: RouteInfo) => {
      if (r.kind === "word") search(r.word, { pushUrl: false });
      else if (r.kind === "mywords") openMyWords(r.tab ?? "recent", false);
      else goHome(false);
    };
    applyRoute(routeFromLocation());

    const onPopState = () => applyRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "쉬운 말로" 토글 + 지금 보고 있는 동음이의어(homoIndex)에 아직 변환본이 없으면 자동으로 가져온다
  // (D17-2, D25 — 동음이의어 탭을 바꿔도 그 탭 전용으로 다시 변환해야 "쉬운 말로"가 항상 맞게 동작한다).
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
          nextEntry.easySenses = easySenses as DictSense[];
        }
        return { ...prev, entry: nextEntry };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [level, result, homoIndex]);

  // 결과가 뜬 뒤 AI 관련어를 지연 호출(핵심 경로를 막지 않는다, D17-3).
  useEffect(() => {
    if (result?.status !== "ok") return;
    let cancelled = false;
    const w = result.entry.word;
    fetchRelated(w).then((words) => {
      if (!cancelled) setAiRelated(words);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const toggleFav = useCallback(() => {
    if (!word) return;
    setFavorites(store.toggleFavorite(word));
  }, [word]);

  const toggleBig = useCallback(() => {
    setBig((b) => {
      const next = !b;
      store.setSettings({ bigMode: next });
      showToast(next ? "큰 화면으로 바꿨어요" : "보통 화면으로 바꿨어요");
      return next;
    });
  }, [showToast]);

  const setReadingLevel = useCallback((lv: ReadingLevel) => {
    setLevel(lv);
    store.setSettings({ level: lv });
  }, []);

  const showingResult = result !== null || loading;
  const related = word && result?.status === "ok" ? relatedWords(word) : null;

  return (
    <div className="min-h-screen">
      {/* 상단 바 */}
      <header className="glassmorphism sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-3 py-2 sm:px-4 sm:py-2.5">
          {/* 모바일: 압축된 한 줄, 아이콘만(현행 유지) */}
          <div className="flex min-h-10 flex-nowrap items-center gap-1.5 sm:hidden">
            <button onClick={() => goHome()} className="flex shrink-0 items-center gap-1.5 font-extrabold text-brand-700">
              <img src="/logo-192.png" alt="" className="size-7 rounded-lg object-contain" width={32} height={32} />
              <span className="text-base">어린이 쉬운 사전</span>
            </button>
            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
              {showingResult ? <LevelToggle level={level} onChange={setReadingLevel} /> : null}
              {!showingResult && page === "home" ? (
                <button
                  onClick={() => openMyWords("recent")}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/60"
                >
                  <BookMarked className="size-4" aria-hidden />
                </button>
              ) : null}
              {showingResult || page !== "home" ? (
                <button
                  onClick={() => goHome()}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/60"
                  aria-label="처음으로"
                >
                  <Home className="size-4" aria-hidden />
                </button>
              ) : null}
              <div className="relative">
                <button
                  onClick={toggleBig}
                  className="flex items-center justify-center rounded-full p-2 text-ink-soft hover:bg-white/60"
                  aria-pressed={big}
                  aria-label={big ? "보통 화면으로" : "큰 화면으로"}
                >
                  {big ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
                </button>
                {toast ? (
                  <div className="pointer-events-none absolute right-0 top-full z-30 mt-2">
                    <div className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* 데스크톱: 제목 좌측 고정, 우측 내비(edu-kit 헤더 패턴). 낱말 화면에서는 나의 낱말사전을 숨기고
              사전 그대로|쉬운 말로 토글을 막대 가운데(절대 배치, 좌우 폭 비대칭과 무관하게 진짜 가운데)로 옮긴다. */}
          <div className="relative hidden min-h-10 flex-nowrap items-center gap-3 sm:flex">
            <button onClick={() => goHome()} className="flex shrink-0 items-center gap-2 font-extrabold text-brand-700">
              <img src="/logo-192.png" alt="" className="size-8 rounded-lg object-contain" width={32} height={32} />
              <span className="text-lg">어린이 쉬운 사전</span>
            </button>

            {showingResult ? (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <div className="pointer-events-auto">
                  <LevelToggle level={level} onChange={setReadingLevel} />
                </div>
              </div>
            ) : null}

            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1">
              {!showingResult && page === "home" ? (
                <button
                  onClick={() => openMyWords("recent")}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/60"
                >
                  <BookMarked className="size-4" aria-hidden />
                  나의 낱말사전
                </button>
              ) : null}
              {showingResult || page !== "home" ? (
                <button
                  onClick={() => goHome()}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/60"
                  aria-label="처음으로"
                >
                  <Home className="size-4" aria-hidden />
                  처음
                </button>
              ) : null}
              <button
                onClick={() => setUsageOpen(true)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-white/60"
              >
                <Info className="size-4" aria-hidden />
                활용 안내
              </button>
              {/* relative 래퍼 — 토스트를 이 버튼 기준 absolute로 앵커링(화면 폭 무관하게 항상 바로 밑, 상단 메뉴와 겹치지 않음) */}
              <div className="relative">
                <button
                  onClick={toggleBig}
                  className="flex items-center justify-center rounded-full p-2 text-ink-soft hover:bg-white/60"
                  aria-pressed={big}
                  aria-label={big ? "보통 화면으로" : "큰 화면으로"}
                >
                  {big ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
                </button>
                {toast ? (
                  <div className="pointer-events-none absolute right-0 top-full z-30 mt-2">
                    <div className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <UsageGuide open={usageOpen} onClose={() => setUsageOpen(false)} />

      {showingResult ? (
        // 큰 화면(발표) 모드에서는 화면 폭을 최대로 써서 교실 투사에 유리하게 한다.
        <main className={big ? "w-full px-4 py-6 sm:px-8" : "mx-auto max-w-5xl px-4 py-6"}>
          {/* 낱말 모드에서는 검색창을 홈보다 절반 정도로 좁혀 결과 카드에 시선이 더 가게 한다. */}
          <div className={`mx-auto mb-6 ${big ? "max-w-lg" : "max-w-sm"}`}>
            <SearchBox onSearch={search} initial={word} autoFocus={false} />
          </div>
          <div className={big ? "mx-auto max-w-6xl" : ""}>
            <ResultCard
              result={result}
              loading={loading}
              longLoading={longLoading}
              favorite={!!word && favorites.includes(word)}
              onToggleFavorite={toggleFav}
              big={big}
              level={level}
              simplifying={simplifying}
              onSuggestionPick={search}
              homoIndex={homoIndex}
              onHomoIndexChange={setHomoIndex}
            />
            {related ? (
              <div className="mt-6">
                <WordChips title={`${related.title} 낱말 더 보기`} emoji={related.emoji} words={related.words} onPick={search} />
              </div>
            ) : null}
            {aiRelated.length > 0 ? (
              <div className="mt-6">
                <WordChips title="비슷한 낱말" emoji="✨" words={aiRelated} onPick={search} />
              </div>
            ) : null}
          </div>
        </main>
      ) : page === "mywords" ? (
        <MyWordsPage
          onSearch={search}
          recent={recent}
          myPopular={myPopular}
          favorites={favorites}
          tab={myWordsTab}
          onTabChange={setMyWordsTab}
          onClearRecent={() => setRecent(store.clearRecent())}
          onBack={() => goHome()}
        />
      ) : (
        <HomeView
          onSearch={search}
          recent={recent}
          popular={popular}
          favorites={favorites}
          onGoto={() => openMyWords("recent")}
        />
      )}
    </div>
  );
}

function LevelToggle({ level, onChange }: { level: ReadingLevel; onChange: (l: ReadingLevel) => void }) {
  const base = "flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-semibold transition-colors sm:px-3";
  return (
    <div className="flex items-center gap-1 rounded-full bg-paper p-1" role="group" aria-label="설명 난이도">
      <button
        onClick={() => onChange("dict")}
        aria-pressed={level === "dict"}
        aria-label="사전 그대로"
        className={`${base} ${level === "dict" ? "bg-white text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink-soft"}`}
      >
        <BookOpen className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">사전 그대로</span>
      </button>
      <button
        onClick={() => onChange("easy")}
        aria-pressed={level === "easy"}
        aria-label="쉬운 말로"
        className={`${base} ${level === "easy" ? "bg-white text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink-soft"}`}
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">쉬운 말로</span>
      </button>
    </div>
  );
}

// 홈 랜딩: 검색창 아래 4열(전체 폭). "자주 찾는 낱말"은 전역(다른 사용자, 최근 30일, D23) — 개인 지표는
// "나의 낱말사전"에 따로 있다(D26).
function HomeView({
  onSearch,
  recent,
  popular,
  favorites,
  onGoto,
}: {
  onSearch: (w: string) => void;
  recent: string[];
  popular: string[];
  favorites: string[];
  onGoto: () => void;
}) {
  const recommended = WORD_SETS[0]?.words.slice(0, LANDING_PREVIEW_MAX) ?? [];
  return (
    <main className="px-4">
      {/* 중앙 대형 검색창 */}
      <section className="flex flex-col items-center pt-[8vh] pb-10 text-center">
        <h1 className="mb-2 text-3xl font-extrabold text-ink sm:text-4xl">어린이 쉬운 사전</h1>
        <p className="mb-8 text-lg text-ink-soft">궁금한 낱말을 적으면 쉬운 뜻과 그림을 보여 줄게요</p>
        <div className="w-full max-w-2xl">
          <SearchBox onSearch={onSearch} big autoFocus />
        </div>
      </section>

      {/* 검색창 아래 4열 — 화면 전체 폭, 각 최대 8개(D23) */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        <WordChips
          title="내가 찾은 낱말"
          emoji="🕘"
          words={recent}
          onPick={onSearch}
          emptyText="아직 찾아본 낱말이 없어요."
          layout="list"
          max={LANDING_PREVIEW_MAX}
          onGoto={onGoto}
        />
        <WordChips
          title="즐겨찾기한 낱말"
          emoji="⭐"
          words={favorites}
          onPick={onSearch}
          emptyText="별표(★)를 누르면 여기에 모여요."
          layout="list"
          max={LANDING_PREVIEW_MAX}
          onGoto={onGoto}
        />
        <WordChips
          title="자주 찾는 낱말"
          emoji="🔥"
          words={popular}
          onPick={onSearch}
          emptyText="함께 많이 찾는 낱말이 곧 보여요."
          layout="list"
          max={LANDING_PREVIEW_MAX}
          onGoto={onGoto}
        />
        <WordChips title="추천 낱말" emoji="🌿" words={recommended} onPick={onSearch} layout="list" onGoto={onGoto} />
      </div>

      <div className="mx-auto max-w-6xl pb-24">
        <ResourceLinks heading="함께 보면 좋은 곳" />
      </div>
    </main>
  );
}

// "나의 낱말사전" — 좌: 나의 활동(탭 + 배지 목록), 우: 낱말 익히기(주제 카드 펼치기). D26.
function MyWordsPage({
  onSearch,
  recent,
  myPopular,
  favorites,
  tab,
  onTabChange,
  onClearRecent,
  onBack,
}: {
  onSearch: (w: string) => void;
  recent: string[];
  myPopular: string[];
  favorites: string[];
  tab: MyWordsTab;
  onTabChange: (t: MyWordsTab) => void;
  onClearRecent: () => void;
  onBack: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interestedTopics, setInterestedTopics] = useState<string[]>(DEFAULT_TOPICS);

  useEffect(() => {
    const s = store.getSettings();
    setInterestedTopics(s.interestedTopics ?? DEFAULT_TOPICS);
  }, []);

  const toggleTopic = (id: string) => {
    setInterestedTopics((cur) => {
      const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
      const safe = next.length > 0 ? next : [id]; // 최소 1개는 남긴다
      store.setSettings({ interestedTopics: safe });
      return safe;
    });
  };

  const listFor: Record<MyWordsTab, { words: string[]; empty: string }> = {
    recent: { words: recent, empty: "아직 찾아본 낱말이 없어요." },
    myPopular: { words: myPopular, empty: "낱말을 찾아볼수록 여기에 순위가 쌓여요." },
    favorite: { words: favorites, empty: "별표(★)를 누르면 여기에 모여요." },
  };
  const current = listFor[tab];
  const visibleTopics = WORD_SETS.filter((s) => interestedTopics.includes(s.id));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> 뒤로
      </button>
      <h1 className="mb-6 text-2xl font-extrabold text-ink">나의 낱말사전</h1>

      {/* 좌: 나의 활동 / 우: 낱말 익히기 — 화면 절반씩 */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-ink-soft">나의 활동</h2>
          <div className="mb-3 flex gap-1 rounded-full bg-paper p-1" role="tablist" aria-label="나의 활동">
            {(
              [
                ["recent", "내가 찾은 낱말"],
                ["favorite", "즐겨찾기 한 낱말"],
                ["myPopular", "내가 자주 찾은 낱말"],
              ] as [MyWordsTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => onTabChange(key)}
                className={`flex-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                  tab === key ? "bg-white text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 배지 목록 — 눌러서 바로 이동하는 용도라 간결하게(D26) */}
          <WordChips
            title=""
            words={current.words}
            onPick={onSearch}
            emptyText={current.empty}
            onClear={tab === "recent" ? onClearRecent : undefined}
            layout="wrap"
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink-soft">낱말 익히기</h2>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-paper"
            >
              <Settings2 className="size-4" aria-hidden /> 관심 주제 ({visibleTopics.length})
            </button>
          </div>
          <div className="space-y-3">
            {visibleTopics.map((set) => (
              <TopicCard key={set.id} set={set} onPick={onSearch} />
            ))}
            {visibleTopics.length === 0 ? <p className="text-sm text-ink-faint">관심 주제를 선택해 주세요.</p> : null}
          </div>
        </section>
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-ink">관심 주제 선택</h2>
                <p className="mt-0.5 text-xs text-ink-faint">화면에 표시할 주제 카드를 골라보세요.</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} aria-label="닫기" className="text-ink-faint hover:text-ink">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {WORD_SETS.map((set) => {
                  const active = interestedTopics.includes(set.id);
                  return (
                    <button
                      key={set.id}
                      onClick={() => toggleTopic(set.id)}
                      aria-pressed={active}
                      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                        active ? "border-brand-500 bg-brand-50 text-brand-700 font-bold" : "border-line bg-white text-ink-soft hover:border-brand-200"
                      }`}
                    >
                      {set.emoji} {set.title} {active ? "✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// 주제 카드 — 누르면 펼쳐져서 그 주제의 낱말을 전부 보여준다("주제를 누르면 더 확장해 찾기").
function TopicCard({ set, onPick }: { set: WordSet; onPick: (w: string) => void }) {
  const [open, setOpen] = useState(false);
  const preview = set.words.slice(0, 6);
  const shown = open ? set.words : preview;
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 text-lg font-extrabold text-ink">
          <span>{set.emoji}</span> {set.title}
        </span>
        <span className="flex items-center gap-1 text-sm text-ink-faint">
          {open ? "접기" : `낱말 ${set.words.length}개`}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map((w) => (
          <button
            key={w}
            onClick={() => onPick(w)}
            className="word-chip rounded-full border border-line bg-paper px-4 py-2 text-base font-semibold text-ink"
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
