import { Star, Loader2, Volume2 } from "lucide-react";
import type { DictAudio, DictHomograph, DictImage, DictSense, LookupResult } from "../types.ts";

interface Props {
  result: LookupResult | null;
  loading: boolean;
  longLoading?: boolean; // 처음 찾는 낱말이라 krdict 실호출로 지연될 때만 켜진다(D28)
  favorite: boolean;
  onToggleFavorite: () => void;
  big: boolean;
  level: "dict" | "easy";
  simplifying: boolean;
  onSuggestionPick?: (word: string) => void;
  homoIndex: number; // 지금 보고 있는 동음이의어(D22). App.tsx가 관리(D25 — "쉬운 말로"가 탭별로 동작하려면
  // 어느 동음이의어를 보는 중인지 상위(App.tsx)의 simplify 호출 로직도 알아야 해서 여기로 끌어올렸다).
  onHomoIndexChange: (i: number) => void;
}

// 검색 결과: 대형 낱말 + 대표 뜻 + 이미지 1장. 낱말·뜻·이미지가 "한 번에" 보이도록 자리를 미리 잡는다.
// 큰 화면(발표) 모드에서는 일반 모니터 기준 화면 높이의 약 70%를 차지하도록 키운다.
export default function ResultCard({
  result,
  loading,
  longLoading,
  favorite,
  onToggleFavorite,
  big,
  level,
  simplifying,
  onSuggestionPick,
  homoIndex,
  onHomoIndexChange,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-faint">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-lg">낱말을 찾고 있어요…</p>
        {longLoading ? <p className="text-sm">처음 찾는 낱말은 조금 더 걸릴 수 있어요.</p> : null}
      </div>
    );
  }
  if (!result) return null;

  const word = "word" in result ? result.word : "";

  // 아직 사전 백엔드가 연결되지 않은 상태(M0) 또는 미수록어(M1, D10).
  if (result.status !== "ok") {
    const suggestion = result.status === "not_found" ? result.suggestion : undefined;
    const msg =
      result.status === "not_ready"
        ? "곧 뜻풀이가 준비될 예정이에요."
        : result.status === "blocked"
          ? "이 낱말은 찾을 수 없어요. 다른 낱말을 적어 볼까요?"
          : "아직 준비 중인 낱말이에요. 다른 낱말을 찾아볼까요?";
    return (
      <div className="rounded-3xl border border-line bg-white p-8 sm:p-10">
        <WordHeader word={word} big={big} favorite={favorite} onToggleFavorite={onToggleFavorite} showFavorite={false} />
        <p className="mt-6 text-lg text-ink-soft">{msg}</p>
        {suggestion ? (
          <button
            onClick={() => onSuggestionPick?.(suggestion)}
            className="mt-4 rounded-full border border-brand-200 bg-brand-50 px-5 py-2.5 text-lg font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            혹시 &lsquo;{suggestion}&rsquo;을(를) 찾으셨나요?
          </button>
        ) : null}
      </div>
    );
  }

  const entry = result.entry;
  // 동음이의어(예: 배¹신체/배²선박/배³과일)가 2개 이상이면 전환 가능한 목록으로, 아니면 대표 1개만(D22).
  const homographs: DictHomograph[] =
    entry.homographs && entry.homographs.length > 1
      ? entry.homographs
      : [{ pos: entry.pos, level: entry.level, senses: entry.senses, image: entry.image, audio: entry.audio, easySenses: entry.easySenses }];
  const safeIndex = homoIndex < homographs.length ? homoIndex : 0;
  const active = homographs[safeIndex] ?? homographs[0];

  // "쉬운 말로" 토글: 지금 보고 있는 동음이의어에 AI 변환본이 있으면 그것을, 없으면(변환 실패·미설정·
  // 로딩 중) 항상 원문을 보여준다 — 화면이 절대 비지 않는 정확성 우선 폴백(계획서 ★). D25: 탭마다 독립.
  const usingEasy = level === "easy" && !!active.easySenses;
  const senses: DictSense[] = usingEasy ? active.easySenses! : active.senses;
  const primary = senses[0];
  const rest = senses.slice(1);

  return (
    <div className={`rounded-3xl border border-line bg-white p-8 sm:p-10 ${big ? "sm:min-h-[70vh] sm:flex sm:flex-col sm:justify-center" : ""}`}>
      <div className={`grid gap-8 sm:grid-cols-[1fr_auto] ${big ? "sm:items-center" : "sm:items-start"}`}>
        <div className="min-w-0">
          <WordHeader
            word={entry.word}
            reading={entry.reading}
            pos={active.pos}
            level={active.level ?? undefined}
            audio={active.audio}
            big={big}
            favorite={favorite}
            onToggleFavorite={onToggleFavorite}
          />

          {homographs.length > 1 ? (
            <div className="mt-4 mb-2">
              <HomographSwitcher homographs={homographs} activeIndex={safeIndex} onSelect={onHomoIndexChange} />
            </div>
          ) : null}

          {level === "easy" && !usingEasy && simplifying ? (
            <p className="mt-4 text-sm text-ink-faint">쉬운 말로 바꾸는 중…</p>
          ) : null}

          {primary ? (
            <div className="mt-8 sm:mt-10">
              <p className={`font-semibold text-ink ${big ? "text-3xl sm:text-4xl leading-relaxed" : "text-xl leading-relaxed"}`}>
                {primary.def}
              </p>
            </div>
          ) : null}

          {primary?.example ? (
            <div className={`mt-4 rounded-2xl bg-paper/70 p-4 border border-line/60 ${big ? "text-lg sm:text-xl" : "text-base sm:text-lg"}`}>
              <span className="font-bold text-brand-700 mr-2">예문</span>
              <span className="text-ink-soft">
                <HighlightWord text={primary.example} word={entry.word} />
              </span>
            </div>
          ) : null}

          <p className="mt-4 text-xs text-ink-faint">
            {entry.source === "encykorea" ? "출처: 한국민족문화대백과사전" : "출처: 국립국어원 한국어기초사전"}
          </p>

          {rest.length > 0 ? (
            <details className="mt-6">
              <summary className="cursor-pointer text-base font-semibold text-brand-600 hover:text-brand-700">뜻 더 보기 ({rest.length})</summary>
              <ul className="mt-3 space-y-3">
                {rest.map((s, i) => (
                  <li key={i} className="rounded-xl bg-paper/40 p-3 border border-line/40 text-base sm:text-lg text-ink-soft">
                    <div className="font-medium text-ink">
                      {i + 2}. {s.def}
                    </div>
                    {s.example ? (
                      <div className="mt-1 text-sm text-ink-faint">
                        <span className="font-semibold text-brand-600 mr-1.5">예:</span>
                        <HighlightWord text={s.example} word={entry.word} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <ResultImage image={active.image} word={entry.word} big={big} />
      </div>
    </div>
  );
}

// 예문 속 표제어 하이라이트(형광펜 효과) — 조사 제외 해당 낱말만 정확히 강조
function HighlightWord({ text, word }: { text: string; word: string }) {
  const cleanWord = word.replace(/[0-9]/g, "").trim();
  if (!cleanWord || !text) return <span>{text}</span>;

  // 정확한 단어(cleanWord)만 분리하여 하이라이트 적용 (뒤따르는 조사는 제외)
  const regex = new RegExp(`(${cleanWord})`, "g");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        part === cleanWord ? (
          <mark key={i} className="rounded-md bg-amber-100/90 text-amber-950 font-bold px-1.5 py-0.5 shadow-xs">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// 완전히 다른 뜻(동음이의어)을 고르는 전환 UI. 대표 뜻만 보여주면 아이가 찾던 뜻이 통째로 사라질 수
// 있어서(예: "배" = 신체/선박/과일) 처음 뜻풀이 앞부분을 미리보기로 보여 주며 나머지를 고를 수 있게 한다.
function HomographSwitcher({
  homographs,
  activeIndex,
  onSelect,
}: {
  homographs: DictHomograph[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-ink-faint">다른 뜻이 {homographs.length}개 있어요</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="동음이의어 선택">
        {homographs.map((h, i) => {
          const preview = h.senses[0]?.def ?? "";
          const short = preview.length > 14 ? `${preview.slice(0, 14)}…` : preview;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(i)}
              title={preview}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                i === activeIndex
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line bg-white text-ink-soft hover:border-brand-200"
              }`}
            >
              <span className="mr-1 text-brand-500">{i + 1}</span>
              {short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WordHeader({
  word,
  reading,
  pos,
  level,
  audio,
  big,
  favorite,
  onToggleFavorite,
  showFavorite = true,
}: {
  word: string;
  reading?: string;
  pos?: string;
  level?: string;
  audio?: DictAudio | null;
  big: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  showFavorite?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={`font-extrabold tracking-tight text-ink ${big ? "text-6xl sm:text-7xl lg:text-8xl" : "text-4xl sm:text-5xl"}`}>
            {word}
          </h1>
          {audio ? <AudioButton audio={audio} big={big} /> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-ink-faint">
          {reading ? <span className="text-lg">[{reading}]</span> : null}
          {pos ? <span className="rounded-full bg-paper px-2.5 py-0.5 text-sm font-semibold">{pos}</span> : null}
          {level ? <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-semibold text-brand-700">{level}</span> : null}
        </div>
      </div>
      {showFavorite ? (
        <button
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          className="ml-auto shrink-0 rounded-full p-2 hover:bg-paper transition-colors"
        >
          <Star className={favorite ? "size-8 fill-warning-500 text-warning-500" : "size-8 text-ink-faint"} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function AudioButton({ audio, big }: { audio: DictAudio; big: boolean }) {
  const play = () => {
    new Audio(audio.url).play().catch(() => {
      /* 자동재생 차단 등은 조용히 무시 — 버튼을 다시 누르면 됨 */
    });
  };
  return (
    <button
      type="button"
      onClick={play}
      aria-label="소리로 듣기"
      title={audio.attribution}
      className={`grid shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100 active:bg-brand-200 transition-colors ${
        big ? "size-12" : "size-10"
      }`}
    >
      <Volume2 className={big ? "size-6" : "size-5"} aria-hidden />
    </button>
  );
}

// 좁은 화면(모바일)에서는 카드 전체 폭을 그대로 쓰고, sm 이상에서만 옆 칸 고정 크기로 전환한다.
// object-contain으로 원본 비율을 그대로 두어(크롭 없음) 삽화의 일부가 잘려 나가지 않게 한다.
function ResultImage({ image, word, big }: { image?: DictImage | null; word: string; big: boolean }) {
  const sizeAtSm = big ? "sm:size-80 lg:size-[26rem]" : "sm:size-56 lg:size-64";
  // krdict·encykorea·네이버 모두 이미지가 없으면(동음이의어의 일반적인 뜻 등) 자리를 아예 비운다 —
  // 가짜 이니셜 타일을 채우지 않는다. 텍스트 열이 grid에서 자연스럽게 폭을 넓혀 채운다.
  if (!image) return null;
  return (
    <figure className={`w-full aspect-square shrink-0 ${sizeAtSm}`}>
      <img
        src={image.url}
        alt={`${word} 그림`}
        className="size-full rounded-2xl bg-paper object-contain"
        loading="eager"
      />
      <figcaption className="mt-1 text-right text-[11px] text-ink-faint">
        {image.attribution}
        {image.source === "naver" ? <span className="ml-1 text-ink-faint/70">· 사진 검색 결과</span> : null}
      </figcaption>
    </figure>
  );
}
