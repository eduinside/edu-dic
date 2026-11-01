// 순우리말 배움터(D28, docs/plan-sunwoori.md). 목록은 scripts/sunwoori-sync.mjs 가 만든 app/data/sunwoori.json.
// 첫 화면 속도(설계 원칙 ★)를 지키려고 전체 목록은 필요할 때 늦게 받고, 첫 화면 한 줄에 쓰는 '이달의 순우리말'만
// 작은 파일로 바로 싣는다.
import latestJson from "../data/sunwoori-latest.json";

export interface SunwooriWord {
  w: string; // 낱말
  no: number; // 한글사랑관 글번호 — 원문 소개 글 주소
  d: string; // 글 올린 날(YYYY-MM-DD)
  pos: string | null; // 표준국어대사전 품사
  kr: boolean | null; // 한국어기초사전 수록 여부(null = 아직 확인 못 함) — '쉬운 낱말' 보기 기준
  g: string | null; // 기초사전 어휘 등급
}

export interface SunwooriData {
  source: { name: string; url: string };
  updated: string;
  words: SunwooriWord[];
}

export const SUNWOORI_PATH = "uri"; // /my 처럼 영문 예약 경로 — 한글(/순우리말)은 낱말 검색 경로(D18)와 겹친다
export const SUNWOORI_SOURCE_NAME = "충북교육문화원 한글사랑관";

export const latestSunwoori = latestJson as SunwooriWord | null;

export function postUrl(no: number): string {
  return `https://www.cbec.go.kr/hangeul/sub.php?menukey=223&mod=view&no=${no}`;
}

let loading: Promise<SunwooriData> | null = null;
let loaded: SunwooriData | null = null;
let wordSet: Set<string> | null = null;

export function loadSunwoori(): Promise<SunwooriData> {
  loading ??= import("../data/sunwoori.json").then((m) => {
    loaded = m.default as SunwooriData;
    wordSet = new Set(loaded.words.map((x) => x.w));
    return loaded;
  });
  return loading;
}

// 목록을 이미 받았을 때만 바로 답한다(안 받았으면 false — 부르는 쪽이 loadSunwoori 뒤 다시 본다).
export function isSunwooriLoaded(word: string): boolean {
  return !!wordSet?.has(word.trim());
}

export function getSunwooriWord(word: string): SunwooriWord | undefined {
  return loaded?.words.find((x) => x.w === word.trim());
}

// 첫 글자 칩: 된소리는 예사소리 칸에 넣는다(ㄲ→ㄱ). 저학년이 찾기 쉽게 14개로.
export const FIRST_SOUNDS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const CHO = ["ㄱ", "ㄱ", "ㄴ", "ㄷ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅂ", "ㅅ", "ㅅ", "ㅇ", "ㅈ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export function firstSound(word: string): string | null {
  const code = word.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return CHO[Math.floor((code - 0xac00) / 588)];
}

// 같은 날 올라온 글(옛 글은 5개씩)도 있어 '이달의 순우리말'은 날짜가 아니라 목록 첫 낱말(가장 최근 글)로 한다.
export function monthLabel(d: string): string {
  const [y, m] = d.split("-");
  return `${y}년 ${Number(m)}월`;
}
