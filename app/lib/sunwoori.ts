// 순우리말 배움터(D28, docs/plan-sunwoori.md). 목록은 scripts/sunwoori-sync.mjs 가 만든 app/data/sunwoori.json.
// 첫 화면 속도(설계 원칙 ★)를 지키려고 전체 목록은 필요할 때 늦게 받고, 첫 화면 한 줄에 쓰는 '오늘의 순우리말'
// 후보(낱말 이름 배열)만 작은 파일로 바로 싣는다.
import dailyJson from "../data/sunwoori-daily.json";

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

const dailyPool = dailyJson as string[];

// 오늘의 순우리말: 브라우저 날짜(그 기기의 하루)로 고른다. 같은 날 같은 반 학생은 같은 낱말을 보고, 자정에 바뀐다.
export function todaySunwoori(now = new Date()): string | null {
  if (dailyPool.length === 0) return null;
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  return dailyPool[day % dailyPool.length];
}

// 배움터 카드의 '다른 낱말' — 지금 낱말과 다른 것을 아무렇게나 하나.
export function randomSunwoori(except?: string): string | null {
  const pool = dailyPool.length > 1 ? dailyPool.filter((w) => w !== except) : dailyPool;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

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

export function todayLabel(now = new Date()): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일`;
}
