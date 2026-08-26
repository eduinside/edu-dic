// 국립국어원 한국어기초사전(krdict) 오픈 API 클라이언트 (계획서 §2.2, 2026-08-26 실호출로 확정한 스펙).
//
// 실측 확인 사항(중요 — 문서에 없던 부분):
//   - krdict.korean.go.kr / krdicmedia.korean.go.kr 모두 User-Agent 헤더가 없으면 400을 반환한다.
//   - /api/view 의 <multimedia_info><link> 는 이미지 자체가 아니라
//     "searchResultView.do?file_no=…" HTML 래퍼 페이지다. 그 페이지의 <img src> 를 한 번 더 파싱해야
//     실제 이미지 경로(krdicmedia.korean.go.kr/convert/.../PIC..._700X466.jpg)가 나온다.
//   - 그 이미지 URL은 GET으로 직접 임베드 가능(리퍼러 체크 없음, HEAD만 403 — 브라우저 <img>는 문제없음).
//   - <pronunciation_info><link> 도 같은 패턴의 HTML 래퍼(searchResultView.do?file_no=…)이고,
//     실제 mp3 경로는 페이지 안 <script>fnCmdPlaywer('audio', '/convert/.../SND..._.mp3', ...)</script>에 있다.
//   - 발음(음성)은 CC BY-NC-ND 2.0 KR(비상업·2차저작물 금지) — 이미지의 CC BY-SA 2.0 KR과 라이선스가 다르다.
//   - 동음이의어 실측 함정 1: "나비"는 표제어가 3개(나비=곤충/중급, 나비=고양이를 부르는 말/중급, 나비=너비/고급)다.
//     word_grade가 같은 항목끼리는 sort=dict(사전순) 응답 순서가 뜻과 무관해서(38881 "고양이" 항목이 38882 "곤충"보다
//     먼저 나옴) sort=popular(빈도순)로 바꿔 실제로 흔히 쓰이는 뜻이 먼저 오게 한다.
//   - 동음이의어 실측 함정 2: "배"는 완전히 다른 뜻(신체 부위/선박/과일/곱절/잔 세는 단위) 5개가 전부
//     초급으로 동률이다. 대표 1개만 보여주면 아이가 찾던 뜻이 통째로 사라질 수 있어(D22) 정확히 일치하는
//     모든 target_code(최대 4개)를 병렬 조회해 DictEntry.homographs 로 함께 담는다.
import type { DictAudio, DictEntry, DictHomograph, DictImage, DictSense } from "../../app/types.ts";
import { decodeXmlEntities, extractAll, extractFirst, extractItems, textOrNull } from "./xml.ts";

const API_BASE = "https://krdict.korean.go.kr/api";
const MEDIA_HOST = "https://krdicmedia.korean.go.kr";
const MAX_HOMOGRAPHS = 4; // 비용 상한(캐시되므로 낱말당 1회만 영향)
// 실측: UA 없으면 400. 브라우저와 유사한 UA를 고정 지정.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 edu-dic/1.0";

function krFetch(url: string): Promise<Response> {
  return fetch(url, { headers: { "user-agent": UA } });
}

interface SearchCandidate {
  targetCode: string;
  word: string;
  grade: string | null;
}

// 표제어가 정확히 일치하는 항목을 sort=popular(빈도순) 순서 그대로 전부 반환한다(동음이의어 함정 대응).
async function searchHomographs(key: string, word: string): Promise<SearchCandidate[]> {
  const url = `${API_BASE}/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(word)}&part=word&sort=popular&num=20`;
  const res = await krFetch(url);
  if (!res.ok) throw new KrdictError(`search HTTP ${res.status}`, res.status);
  const xml = await res.text();

  const items = extractItems(xml).map((block) => ({
    targetCode: textOrNull(extractFirst(block, "target_code")),
    word: textOrNull(extractFirst(block, "word")),
    grade: textOrNull(extractFirst(block, "word_grade")),
  }));

  return items
    .filter((it): it is SearchCandidate => it.word === word && !!it.targetCode)
    .slice(0, MAX_HOMOGRAPHS);
}

// 오타 교정(D17-1)·관련어 검증(D17-3)용 — 존재 여부와 대표 표기만 필요하므로 첫 후보만 확인.
export async function searchWord(key: string, word: string): Promise<SearchCandidate | null> {
  const found = await searchHomographs(key, word);
  return found[0] ?? null;
}

interface ViewDetail {
  word: string;
  pronunciation: string | null;
  pos: string | null;
  grade: string | null;
  senses: DictSense[];
  mediaPageUrl: string | null; // 이미지: searchResultView.do?file_no=… (실제 이미지 아님, 재조회 필요)
  audioPageUrl: string | null; // 발음(소리): 같은 패턴의 래퍼 페이지
}

async function viewDetail(key: string, targetCode: string): Promise<ViewDetail | null> {
  const url = `${API_BASE}/view?key=${encodeURIComponent(key)}&method=target_code&q=${encodeURIComponent(targetCode)}`;
  const res = await krFetch(url);
  if (!res.ok) throw new KrdictError(`view HTTP ${res.status}`, res.status);
  const xml = await res.text();

  const item = extractFirst(xml, "item");
  if (!item) return null;
  const wordInfo = extractFirst(item, "word_info");
  if (!wordInfo) return null;

  const word = textOrNull(extractFirst(wordInfo, "word")) ?? "";
  const pronunciationBlock = extractFirst(wordInfo, "pronunciation_info");
  const pronunciation = textOrNull(extractFirst(pronunciationBlock ?? "", "pronunciation"));
  const audioPageUrl = textOrNull(extractFirst(pronunciationBlock ?? "", "link"));
  const pos = textOrNull(extractFirst(wordInfo, "pos"));
  const grade = textOrNull(extractFirst(wordInfo, "word_grade"));

  const senseBlocks = extractAll(wordInfo, "sense_info");
  const senses: DictSense[] = senseBlocks
    .map((block) => {
      const def = textOrNull(extractFirst(block, "definition"));
      if (!def) return null;

      // 예문 수집: 문장형(또는 대화형) 대표 예문 최대 2개를 " / "로 연결하여 한 줄로 제공
      let example: string | undefined = undefined;
      const exampleBlocks = extractAll(block, "example_info");

      const sentenceExamples: string[] = [];
      const dialogueExamples: string[] = [];
      const phraseExamples: string[] = [];

      for (const exBlock of exampleBlocks) {
        const type = textOrNull(extractFirst(exBlock, "type")) ?? "문장";
        const exTexts = extractAll(exBlock, "example")
          .map((e) => textOrNull(e))
          .filter((e): e is string => !!e)
          .map((t) => t.replace(/[\r\n]+/g, " / ").replace(/\s*\/\s*/g, " / ").trim());

        if (type === "문장") {
          sentenceExamples.push(...exTexts);
        } else if (type === "대화") {
          dialogueExamples.push(...exTexts);
        } else if (type === "구") {
          phraseExamples.push(...exTexts);
        }
      }

      if (sentenceExamples.length > 0) {
        example = sentenceExamples.slice(0, 2).join(" / ");
      } else if (dialogueExamples.length > 0) {
        example = dialogueExamples.slice(0, 2).join(" / ");
      } else if (phraseExamples.length > 0) {
        example = phraseExamples.slice(0, 2).join(" / ");
      }

      return { def, example } as DictSense;
    })
    .filter((s): s is DictSense => s !== null);



  // 사진/삽화 타입의 첫 multimedia_info 링크를 대표 이미지 후보로 사용(동영상·음성 등은 제외).
  let mediaPageUrl: string | null = null;
  for (const block of senseBlocks) {
    for (const mm of extractAll(block, "multimedia_info")) {
      const type = textOrNull(extractFirst(mm, "type"));
      const link = textOrNull(extractFirst(mm, "link"));
      if (link && (type === "사진" || type === "삽화")) {
        mediaPageUrl = link;
        break;
      }
    }
    if (mediaPageUrl) break;
  }

  return { word, pronunciation, pos, grade, senses, mediaPageUrl, audioPageUrl };
}

// searchResultView.do?file_no=… HTML 페이지에서 실제 이미지 경로를 뽑아 절대 URL로 만든다.
// (CC BY-SA 배지 이미지 cc_by_sa.png 는 제외하고 첫 콘텐츠 이미지만 취한다.)
async function resolveImageUrl(mediaPageUrl: string): Promise<string | null> {
  const res = await krFetch(mediaPageUrl);
  if (!res.ok) return null;
  const html = await res.text();
  const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  const contentSrc = srcs.find((s) => !s.includes("cc_by_sa") && !s.includes("/common/"));
  if (!contentSrc) return null;
  return contentSrc.startsWith("http") ? contentSrc : `${MEDIA_HOST}${contentSrc}`;
}

// 발음 래퍼 페이지에서 실제 mp3 경로를 뽑는다. <script>fnCmdPlaywer('audio', '/convert/.../SND..._.mp3', ...)</script> 패턴.
async function resolveAudioUrl(audioPageUrl: string): Promise<string | null> {
  const res = await krFetch(audioPageUrl);
  if (!res.ok) return null;
  const html = await res.text();
  const m = /fnCmdPlaywer\(\s*'audio'\s*,\s*'([^']+\.mp3)'/i.exec(html);
  if (!m) return null;
  const path = m[1];
  return path.startsWith("http") ? path : `${MEDIA_HOST}${path}`;
}

// krdict는 등급 없는 낱말에 null이 아니라 문자열 "없음"을 준다(실측) — UI에 배지로 새지 않도록 정규화.
function normalizeLevel(grade: string | null): DictEntry["level"] {
  if (grade === "초급" || grade === "중급" || grade === "고급") return grade;
  return null;
}

export class KrdictError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const IMAGE_ATTRIBUTION = "출처: 국립국어원 한국어기초사전(CC BY-SA 2.0 KR)";
const AUDIO_ATTRIBUTION = "출처: 국립국어원 한국어기초사전(비상업적 이용만 허용, CC BY-NC-ND 2.0 KR)";

// target_code 하나를 완전한 동음이의어 항목(DictHomograph)으로 조립. 이미지·소리 래퍼 해석까지 포함.
async function buildHomograph(detail: ViewDetail): Promise<DictHomograph | null> {
  if (detail.senses.length === 0) return null;

  // 이미지·소리 래퍼 해석은 서로 무관하니 순차 대기하지 않고 동시에 진행한다(첫 조회 지연 단축).
  const [imageUrl, audioUrl] = await Promise.all([
    detail.mediaPageUrl ? resolveImageUrl(detail.mediaPageUrl) : Promise.resolve(null),
    detail.audioPageUrl ? resolveAudioUrl(detail.audioPageUrl) : Promise.resolve(null),
  ]);
  const image: DictImage | null = imageUrl
    ? { url: imageUrl, license: "CC BY-SA 2.0 KR", attribution: IMAGE_ATTRIBUTION, source: "krdict" }
    : null;
  const audio: DictAudio | null = audioUrl ? { url: audioUrl, license: "CC BY-NC-ND 2.0 KR", attribution: AUDIO_ATTRIBUTION } : null;

  return {
    pos: detail.pos ?? undefined,
    level: normalizeLevel(detail.grade),
    senses: detail.senses,
    image,
    audio,
  };
}

export async function fetchDictEntry(key: string, word: string): Promise<DictEntry | null> {
  const candidates = await searchHomographs(key, word);
  if (candidates.length === 0) return null;

  const details = (await Promise.all(candidates.map((c) => viewDetail(key, c.targetCode)))).filter(
    (d): d is ViewDetail => d !== null,
  );
  const built = await Promise.all(details.map(async (d) => ({ detail: d, homograph: await buildHomograph(d) })));
  const pairs = built.filter((b): b is { detail: ViewDetail; homograph: DictHomograph } => b.homograph !== null);

  const primaryPair = pairs[0];
  if (!primaryPair) return null;
  const { detail: primaryDetail, homograph: primary } = primaryPair;
  const homographs = pairs.map((p) => p.homograph);

  return {
    word: decodeXmlEntities(primaryDetail.word || word),
    reading: primaryDetail.pronunciation ?? undefined,
    pos: primary.pos,
    level: primary.level,
    senses: primary.senses,
    image: primary.image,
    audio: primary.audio,
    homographs: homographs.length > 1 ? homographs : undefined,
    source: "krdict",
    fetchedAt: new Date().toISOString(),
  };
}
