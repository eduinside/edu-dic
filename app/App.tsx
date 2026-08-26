import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Maximize2,
  Minimize2,
  Home,
  Sparkles,
  BookMarked,
  BookOpen,
  ArrowLeft,
  ChevronDown,
  Settings2,
  X,
  Info,
  Plus,
  Trash2,
  Loader2,
  Check,
  Share2,
} from "lucide-react";
import SearchBox from "./components/SearchBox.tsx";
import WordChips from "./components/WordChips.tsx";
import ResultCard from "./components/ResultCard.tsx";
import ResourceLinks from "./components/ResourceLinks.tsx";
import UsageGuide from "./components/UsageGuide.tsx";
import {
  createTopicShareLink,
  fetchEasySenses,
  fetchPopular,
  fetchRelated,
  fetchTopicWords,
  lookupWord,
} from "./lib/api.ts";
import { relatedWords, WORD_SETS, type WordSet } from "./lib/words.ts";
import * as store from "./lib/storage.ts";
import type { CustomWordSet, DictSense, LookupResult, ReadingLevel } from "./types.ts";

const LANDING_PREVIEW_MAX = 5; // 랜딩 4열 각각 최대 개수(D23)

// 낱말 익히기 기본 노출 주제 4개(24절기, 학교생활 필수 + 나머지 세트 중 랜덤 2개)
function getRandomDefaultTopics(): string[] {
  const fixed = ["solar-terms", "school-life"];
  const others = WORD_SETS.map((s) => s.id).filter((id) => !fixed.includes(id));
  const shuffled = [...others].sort(() => Math.random() - 0.5);
  return [...fixed, ...shuffled.slice(0, 2)];
}


const MYWORDS_PATH = "my"; // "나의 낱말사전" 전용 URL(D27) — 검색어 경로(/나비)와 겹치지 않게 예약.

// 주소 경로를 해석한다. /my 는 예약 경로(D27), 그 외 비어있지 않은 경로는 검색어(/나비, D18).
// 과거에 공유된 ?q= 링크도 계속 동작하도록 폴백으로 남겨 둔다.
type RouteInfo = { kind: "mywords"; tab: MyWordsTab | null } | { kind: "word"; word: string; homograph?: number } | { kind: "home" };
function routeFromLocation(): RouteInfo {
  const path = decodeURIComponent(window.location.pathname.replace(/^\/+/, "")).trim();
  const hash = window.location.hash.replace(/^#/, "").trim();
  const homograph = hash && !isNaN(Number(hash)) && Number(hash) >= 1 ? parseInt(hash, 10) - 1 : undefined;

  if (path === MYWORDS_PATH) {
    const tab = new URLSearchParams(window.location.search).get("tab") as MyWordsTab | null;
    return { kind: "mywords", tab: tab && ["recent", "myPopular", "favorite"].includes(tab) ? tab : null };
  }
  if (path) return { kind: "word", word: path, homograph };
  const q = new URLSearchParams(window.location.search).get("q")?.trim();
  if (q) return { kind: "word", word: q, homograph };
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
  const [customWordSets, setCustomWordSets] = useState<CustomWordSet[]>([]); // 사용자 정의 관심 주제 (PLAN.md §13)
  const [highlightedTopicId, setHighlightedTopicId] = useState<string | null>(null); // 공유/추가 시 번쩍이는 주제 ID
  const [big, setBig] = useState(false);
  const [level, setLevel] = useState<ReadingLevel>("dict");
  const [simplifying, setSimplifying] = useState(false);
  const [aiRelated, setAiRelated] = useState<string[]>([]);
  const [communityTopic, setCommunityTopic] = useState<{ title: string; emoji: string; words: string[] } | null>(null);
  const [homoIndex, setHomoIndex] = useState(0);

  const [toast, setToast] = useState<string | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const requestSeq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const handleAddCustomSet = useCallback((newSet: CustomWordSet) => {
    const updated = store.saveCustomWordSet(newSet);
    setCustomWordSets(updated);
    setHighlightedTopicId(newSet.id);
    setTimeout(() => setHighlightedTopicId(null), 2500);
    showToast(`'${newSet.title}' 주제가 추가되었어요!`);
  }, [showToast]);

  const handleDeleteCustomSet = useCallback((id: string) => {
    const updated = store.deleteCustomWordSet(id);
    setCustomWordSets(updated);
    showToast("주제가 삭제되었어요.");
  }, [showToast]);

  const handleShareCustomSet = useCallback(
    async (set: CustomWordSet) => {
      const url = await createTopicShareLink({
        title: set.title,
        emoji: set.emoji,
        words: set.words,
      });
      if (url) {
        await navigator.clipboard.writeText(url).catch(() => {});
        setHighlightedTopicId(set.id);
        setTimeout(() => setHighlightedTopicId(null), 2500);
        showToast("공유 링크가 복사되었어요! (dgedu.link)");
      } else {
        showToast("공유 링크 생성에 실패했어요.");
      }
    },
    [showToast],
  );

  const search = useCallback(async (w: string, opts: { pushUrl?: boolean; homograph?: number } = {}) => {
    const q = w.trim();
    if (!q) return;
    const { pushUrl = true, homograph } = opts;
    const initialHomo = typeof homograph === "number" && homograph >= 0 ? homograph : 0;
    const seq = ++requestSeq.current;
    setPage("home");
    setWord(q);
    setLoading(true);
    setLongLoading(false);
    setResult(null);
    setAiRelated([]);
    setCommunityTopic(null);
    setHomoIndex(initialHomo);

    if (pushUrl) {
      const hashStr = initialHomo > 0 ? `#${initialHomo + 1}` : "";
      window.history.pushState({ q }, "", `/${encodeURIComponent(q)}${hashStr}`);
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
      if (r.entry.homographs && r.entry.homographs.length > 0) {
        if (initialHomo >= r.entry.homographs.length) {
          setHomoIndex(0);
        }
      }
      setRecent(store.pushRecent(q));
      store.bumpSearchCount(q);
      setMyPopular(store.getMostSearched());
    }
  }, []);

  const handleHomoIndexChange = useCallback((i: number) => {
    setHomoIndex(i);
    const hashStr = i > 0 ? `#${i + 1}` : "";
    const currentPath = window.location.pathname;
    window.history.replaceState(null, "", `${currentPath}${hashStr}`);
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
    const initialCustoms = store.getCustomWordSets();
    setCustomWordSets(initialCustoms);
    const s = store.getSettings();
    setBig(s.bigMode ?? false);
    setLevel(s.level ?? "dict");
    fetchPopular().then(setPopular);

    // 공유 링크(?shareId=... 또는 ?shareTopic=...)로 진입한 경우 처리
    const searchParams = new URLSearchParams(window.location.search);
    const shareTopicParam = searchParams.get("shareTopic");
    const shareIdParam = searchParams.get("shareId");

    const importTopic = (parsed: { title?: string; emoji?: string; words?: string[] }) => {
      if (parsed.title && Array.isArray(parsed.words) && parsed.words.length > 0) {
        const newSet: CustomWordSet = {
          id: `custom_${Date.now()}`,
          title: parsed.title,
          emoji: parsed.emoji || "💡",
          words: parsed.words,
          createdAt: new Date().toISOString(),
          isShared: true, // 공유 받음 표식
        };

        const updated = store.saveCustomWordSet(newSet);
        setCustomWordSets(updated);
        // 관심 주제에 추가
        const curSettings = store.getSettings();
        const nextTopics = curSettings.interestedTopics
          ? [newSet.id, ...curSettings.interestedTopics.filter((t) => t !== newSet.id)]
          : [newSet.id, ...getRandomDefaultTopics()];
        store.setSettings({ interestedTopics: nextTopics });


        setHighlightedTopicId(newSet.id);
        setTimeout(() => setHighlightedTopicId(null), 3000);
        showToast(`'${newSet.title}' 주제가 낱말사전에 추가되었어요!`);
        window.history.replaceState({}, "", `/${MYWORDS_PATH}`);
        openMyWords("recent", false);
      }
    };

    if (shareTopicParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(shareTopicParam)) as {
          title?: string;
          emoji?: string;
          words?: string[];
        };
        importTopic(parsed);
        return;
      } catch {
        /* 파싱 실패 시 일반 라우트 진행 */
      }
    } else if (shareIdParam) {
      fetch(`/api/share-topic?id=${encodeURIComponent(shareIdParam)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.status === "ok") {
            importTopic(data as { title?: string; emoji?: string; words?: string[] });
          }
        })
        .catch(() => {});
    }


    const applyRoute = (r: RouteInfo) => {
      if (r.kind === "word") search(r.word, { pushUrl: false, homograph: r.homograph });
      else if (r.kind === "mywords") openMyWords(r.tab ?? "recent", false);
      else goHome(false);
    };
    applyRoute(routeFromLocation());

    const onPopState = () => applyRoute(routeFromLocation());
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (hash && !isNaN(Number(hash))) {
        const idx = parseInt(hash, 10) - 1;
        if (idx >= 0) setHomoIndex(idx);
      } else if (!hash) {
        setHomoIndex(0);
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
    };
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

  // 결과가 뜬 뒤 AI 관련어 및 커스텀 낱말사전 소속 주제를 지연 호출(D17-3).
  useEffect(() => {
    if (result?.status !== "ok") return;
    let cancelled = false;
    const w = result.entry.word;
    fetchRelated(w).then((res) => {
      if (!cancelled) {
        setAiRelated(res.words);
        setCommunityTopic(res.communityTopic ?? null);
      }
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
  const related = word && result?.status === "ok" ? relatedWords(word, 10, customWordSets) : null;

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
              onHomoIndexChange={handleHomoIndexChange}
            />

            {/* 1. 내가 만든 주제 또는 기본 세트에 속한 경우 */}
            {related ? (
              <div className="mt-6">
                <WordChips title={`${related.title} 낱말 더 보기`} emoji={related.emoji} words={related.words} onPick={search} />
              </div>
            ) : communityTopic ? (
              /* 2. 다른 사용자가 등록/공유한 커스텀 낱말사전 소속 주제 */
              <div className="mt-6">
                <WordChips title={`${communityTopic.title} (함께 만든 주제)`} emoji={communityTopic.emoji} words={communityTopic.words} onPick={search} />
              </div>
            ) : null}

            {/* 3. AI 추천 비슷한 낱말 */}
            {aiRelated.length > 0 ? (
              <div className="mt-6">
                <WordChips title="AI 비슷한 낱말" emoji="✨" words={aiRelated} onPick={search} />
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
          customWordSets={customWordSets}
          highlightedTopicId={highlightedTopicId}
          onAddCustomSet={handleAddCustomSet}
          onDeleteCustomSet={handleDeleteCustomSet}
          onShareCustomSet={handleShareCustomSet}
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
          customWordSets={customWordSets}
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

// 홈 랜딩: 검색창 아래 4열(전체 폭). "함께 보면 좋은 곳"은 화면 최하단(Footer)에 배치.
function HomeView({
  onSearch,
  recent,
  popular,
  favorites,
  customWordSets = [],
  onGoto,
}: {
  onSearch: (w: string) => void;
  recent: string[];
  popular: string[];
  favorites: string[];
  customWordSets?: CustomWordSet[];
  onGoto: () => void;
}) {
  const recommended = useMemo(() => {
    const allPool = Array.from(new Set([...customWordSets, ...WORD_SETS].flatMap((s) => s.words)));
    const shuffled = [...allPool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, LANDING_PREVIEW_MAX);
  }, [customWordSets]);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-between px-4">
      <div>
        {/* 중앙 대형 검색창 (상단 90px, 하단 150px 여백) */}
        <section className="flex flex-col items-center pt-[90px] sm:pt-[110px] pb-[150px] sm:pb-[170px] text-center">

          <h1 className="mb-2 text-3xl font-extrabold text-ink sm:text-4xl">어린이 쉬운 사전</h1>
          <p className="mb-8 text-lg text-ink-soft">궁금한 낱말을 쉬운 말과 그림으로 알아봐요.</p>
          <div className="w-full max-w-2xl">
            <SearchBox onSearch={onSearch} big autoFocus />
          </div>
        </section>

        {/* 검색창 아래 4열 — 화면 전체 폭, 각 최대 5개 */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 mb-16 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* 화면 최하단에 배치되는 리소스 링크 영역 */}
      <footer className="mx-auto w-full max-w-5xl pb-10 pt-6 border-t border-line/40 mt-auto">
        <ResourceLinks heading="함께 보면 좋은 곳" />
      </footer>
    </main>
  );
}

// "나의 낱말사전" — 좌: 나의 활동(탭 + 배지 목록), 우: 낱말 익히기(주제 카드 펼치기). D26, PLAN.md §13.
function MyWordsPage({
  onSearch,
  recent,
  myPopular,
  favorites,
  customWordSets,
  highlightedTopicId,
  onAddCustomSet,
  onDeleteCustomSet,
  onShareCustomSet,
  tab,
  onTabChange,
  onClearRecent,
  onBack,
}: {
  onSearch: (w: string) => void;
  recent: string[];
  myPopular: string[];
  favorites: string[];
  customWordSets: CustomWordSet[];
  highlightedTopicId: string | null;
  onAddCustomSet: (set: CustomWordSet) => void;
  onDeleteCustomSet: (id: string) => void;
  onShareCustomSet: (set: CustomWordSet) => void;
  tab: MyWordsTab;
  onTabChange: (t: MyWordsTab) => void;
  onClearRecent: () => void;
  onBack: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [interestedTopics, setInterestedTopics] = useState<string[]>(getRandomDefaultTopics);

  useEffect(() => {
    const s = store.getSettings();
    setInterestedTopics(s.interestedTopics ?? getRandomDefaultTopics());
  }, [customWordSets]);



  const toggleTopic = (id: string) => {
    setInterestedTopics((cur) => {
      const next = cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id];
      const safe = next.length > 0 ? next : [id]; // 최소 1개는 남긴다
      store.setSettings({ interestedTopics: safe });
      return safe;
    });
  };

  const handleCreated = (newSet: CustomWordSet) => {
    onAddCustomSet(newSet);
    // 새로 만든 주제는 자동으로 관심 주제에 추가
    setInterestedTopics((cur) => {
      const next = cur.includes(newSet.id) ? cur : [newSet.id, ...cur];
      store.setSettings({ interestedTopics: next });
      return next;
    });
    setCreateOpen(false);
  };

  const listFor: Record<MyWordsTab, { words: string[]; empty: string }> = {
    recent: { words: recent, empty: "아직 찾아본 낱말이 없어요." },
    myPopular: { words: myPopular, empty: "낱말을 찾아볼수록 여기에 순위가 쌓여요." },
    favorite: { words: favorites, empty: "별표(★)를 누르면 여기에 모여요." },
  };
  const current = listFor[tab];

  const allTopics: WordSet[] = [...customWordSets, ...WORD_SETS];
  const visibleTopics = allTopics.filter((s) => interestedTopics.includes(s.id));

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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-3 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-100 transition-colors shadow-xs"
              >
                <Plus className="size-4" aria-hidden /> 새 주제
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-paper transition-colors"
              >
                <Settings2 className="size-4" aria-hidden /> 관심 주제 ({visibleTopics.length})
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {visibleTopics.map((set) => {
              const customItem = customWordSets.find((c) => c.id === set.id);
              const isHighlighted = highlightedTopicId === set.id;
              return (
                <TopicCard
                  key={set.id}
                  set={set}
                  onPick={onSearch}
                  isCustom={!!customItem}
                  highlighted={isHighlighted}
                  onShare={customItem ? () => onShareCustomSet(customItem) : undefined}
                  onDelete={customItem ? () => onDeleteCustomSet(set.id) : undefined}
                />
              );
            })}
            {visibleTopics.length === 0 ? <p className="text-sm text-ink-faint">관심 주제를 선택해 주세요.</p> : null}
          </div>
        </section>
      </div>

      {/* 관심 주제 선택 모달 */}
      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-ink">관심 주제 선택</h2>
                <p className="mt-0.5 text-xs text-ink-faint">화면에 표시할 주제 카드를 골라보세요.</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} aria-label="닫기" className="text-ink-faint hover:text-ink">
                <X className="size-5" aria-hidden />
              </button>
            </div>

            {/* 새 주제 만들기 바로가기 배너 (im-not-ai 문구 정제) */}
            <div className="mb-5 flex items-center justify-between rounded-xl bg-brand-50 p-3.5 border border-brand-200">
              <span className="text-sm font-medium text-brand-900">새로운 주제로 낱말을 모아볼까요?</span>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  setCreateOpen(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition-colors shadow-xs"
              >
                <Plus className="size-3.5" aria-hidden /> 새 주제 만들기
              </button>
            </div>

            {/* 사용자 추가 주제 섹션 (있을 때만 노출) */}
            {customWordSets.length > 0 ? (
              <div className="mb-5">
                <h3 className="mb-2 text-xs font-bold text-ink-soft">내가 만든 주제</h3>
                <div className="flex flex-wrap gap-2">
                  {customWordSets.map((set) => {
                    const active = interestedTopics.includes(set.id);
                    return (
                      <div key={set.id} className="relative inline-flex items-center">
                        <button
                          onClick={() => toggleTopic(set.id)}
                          aria-pressed={active}
                          className={`flex items-center gap-1.5 rounded-full border py-2 pl-3.5 pr-8 text-sm font-semibold transition-colors ${
                            active
                              ? "border-brand-500 bg-brand-50 text-brand-700 font-bold"
                              : "border-line bg-white text-ink-soft hover:border-brand-200"
                          }`}
                        >
                          <span>{set.emoji}</span>
                          <span>{set.title}</span>
                          {active ? <Check className="size-3.5 text-brand-600" /> : null}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`'${set.title}' 주제를 삭제할까요?`)) {
                              onDeleteCustomSet(set.id);
                            }
                          }}
                          className="absolute right-2 p-1 text-ink-faint hover:text-red-600 transition-colors"
                          title="주제 삭제"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 기본 큐레이션 주제 섹션 */}
            <div>
              <h3 className="mb-2 text-xs font-bold text-ink-soft">기본 주제</h3>
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

      {/* 새 주제 만들기 모달 */}
      <CreateTopicModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </main>
  );
}

// 새 관심 주제 만들기 모달 (im-not-ai 문구 정제 & 웹문서 연계 어휘 생성)
function CreateTopicModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (set: CustomWordSet) => void;
}) {
  const [topicInput, setTopicInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [generatedEmoji, setGeneratedEmoji] = useState("💡");
  const [words, setWords] = useState<string[]>([]);
  const [manualWord, setManualWord] = useState("");

  if (!open) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const t = topicInput.trim();
    if (!t) {
      setErrorMsg("주제명을 입력해주세요.");
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    const res = await fetchTopicWords(t);
    setLoading(false);

    if (res.status === "ok" && res.words.length > 0) {
      setWords(res.words);
      if (res.emoji) setGeneratedEmoji(res.emoji);
    } else {
      setErrorMsg(res.message || "주제에 맞는 낱말을 찾지 못했어요. 다른 주제로 적어보세요.");
    }
  };

  const handleRemoveWord = (w: string) => {
    setWords((cur) => cur.filter((item) => item !== w));
  };

  const handleAddManualWord = (e: React.FormEvent) => {
    e.preventDefault();
    const w = manualWord.trim();
    if (!w) return;
    if (!words.includes(w)) {
      setWords((cur) => [...cur, w]);
    }
    setManualWord("");
  };

  const handleSave = () => {
    const t = topicInput.trim();
    if (!t) {
      setErrorMsg("주제명을 입력해주세요.");
      return;
    }
    if (words.length === 0) {
      setErrorMsg("낱말이 1개 이상 필요해요. 낱말을 모으거나 직접 추가해주세요.");
      return;
    }

    const newSet: CustomWordSet = {
      id: `custom_${Date.now()}`,
      title: t,
      emoji: generatedEmoji,
      words,
      createdAt: new Date().toISOString(),
    };

    onCreated(newSet);
  };

  const PRESET_EMOJIS = ["🚀", "🦖", "⛺", "🎨", "🔬", "🏰", "🌊", "🎸", "🧁", "⚽", "💡", "🌈", "🌾", "🪁", "❄️"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">새 관심 주제 만들기</h2>
            <p className="mt-0.5 text-xs text-ink-faint">주제를 적으면 알맞은 쉬운 낱말을 사전에서 골라 모아줘요.</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>


        {/* 주제 입력 및 어휘 수집 폼 */}
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label htmlFor="topic-input" className="block text-xs font-bold text-ink-soft mb-1.5">
              어떤 주제의 낱말을 모아볼까요?
            </label>
            <div className="flex gap-2">
              <input
                id="topic-input"
                type="text"
                value={topicInput}
                onChange={(e) => {
                  setTopicInput(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="예: 24절기, 우주와 별, 전래동화, 과학 실험"
                maxLength={20}
                className="flex-1 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !topicInput.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0 shadow-xs"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                <span>사전에서 낱말 모으기</span>
              </button>
            </div>
          </div>
        </form>

        {errorMsg ? <p className="mt-2 text-xs font-semibold text-red-600">{errorMsg}</p> : null}

        {loading ? (
          <div className="my-8 flex flex-col items-center justify-center py-8 text-center rounded-2xl bg-paper/60 border border-line/60">
            <Loader2 className="size-8 animate-spin text-brand-600 mb-3" />
            <p className="text-sm font-bold text-ink">사전에서 어린이 눈높이에 맞는 낱말을 꼼꼼히 찾고 있어요...</p>
            <p className="text-xs text-ink-faint mt-1.5">국립국어원 한국어기초사전에 등록된 알맞은 낱말만 엄선하고 있어요.</p>
          </div>
        ) : null}

        {/* 생성된 낱말 목록 및 편집 영역 */}
        {words.length > 0 && !loading ? (
          <div className="mt-6 space-y-4 border-t border-line pt-4">
            <div>
              <label className="block text-xs font-bold text-ink-soft mb-1.5">대표 이모지</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setGeneratedEmoji(em)}
                    className={`size-8 rounded-lg text-lg flex items-center justify-center border transition-transform ${
                      generatedEmoji === em ? "border-brand-500 bg-brand-50 scale-110 shadow-sm" : "border-line hover:bg-paper"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold text-ink-soft">모은 낱말 ({words.length}개)</label>
                <span className="text-xs text-ink-faint">X를 눌러 제외할 수 있어요</span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 bg-paper rounded-xl border border-line">
                {words.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 rounded-full bg-white border border-line px-3 py-1.5 text-sm font-semibold text-ink shadow-xs"
                  >
                    <span>{w}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveWord(w)}
                      className="text-ink-faint hover:text-red-500 transition-colors"
                      title="낱말 빼기"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* 직접 낱말 추가 인풋 */}
            <form onSubmit={handleAddManualWord} className="flex gap-2">
              <input
                type="text"
                value={manualWord}
                onChange={(e) => setManualWord(e.target.value)}
                placeholder="추가하고 싶은 낱말 적기"
                maxLength={10}
                className="flex-1 rounded-xl border border-line px-3 py-2 text-xs font-medium text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manualWord.trim()}
                className="rounded-xl border border-line bg-paper px-3 py-2 text-xs font-bold text-ink-soft hover:bg-white disabled:opacity-50 transition-colors"
              >
                + 추가
              </button>
            </form>

            <div className="pt-3 border-t border-line flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 shadow-sm transition-colors"
              >
                주제 저장하기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 주제 카드 — 누르면 펼쳐져서 그 주제의 낱말을 전부 보여준다("주제를 누르면 더 확장해 찾기").
// 공유 완료 시 또는 외부 링크 진입 시 highlighted=true 로 번쩍이는 플래시 애니메이션 효과 제공.
function TopicCard({
  set,
  onPick,
  isCustom,
  highlighted,
  onShare,
  onDelete,
}: {
  set: WordSet;
  onPick: (w: string) => void;
  isCustom?: boolean;
  highlighted?: boolean;
  onShare?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const preview = set.words.slice(0, 5);
  const shown = open ? set.words : preview;


  const cardClasses = highlighted
    ? "rounded-2xl border-2 border-brand-500 bg-brand-50/70 p-4 shadow-md ring-4 ring-brand-200/60 transition-all duration-500 animate-pulse"
    : "rounded-2xl border border-line bg-white p-4 transition-all duration-300";

  return (
    <div className={cardClasses}>
      <div className="flex w-full items-center justify-between">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <span className="text-xl">{set.emoji}</span>
          <span className="text-lg font-extrabold text-ink">{set.title}</span>
          {isCustom ? (
            (set as CustomWordSet).isShared ? (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-200">
                공유 받음
              </span>
            ) : (
              <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 border border-brand-200">
                직접 만듦
              </span>
            )
          ) : null}
        </button>

        <div className="flex items-center gap-1.5">
          {isCustom && onShare ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink-soft hover:bg-brand-50 hover:text-brand-700 transition-colors border border-line/60"
              title="dgedu.link로 주제 공유하기"
            >
              <Share2 className="size-3.5" />
              <span>공유</span>
            </button>
          ) : null}
          {isCustom && onDelete ? (
            <button
              onClick={() => {
                if (window.confirm(`'${set.title}' 주제를 삭제할까요?`)) {
                  onDelete();
                }
              }}
              className="p-1.5 text-ink-faint hover:text-red-600 transition-colors"
              title="주제 삭제"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-sm text-ink-faint hover:text-ink-soft transition-colors ml-1"
          >
            <span>{open ? "접기" : `낱말 ${set.words.length}개`}</span>
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
      </div>
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
