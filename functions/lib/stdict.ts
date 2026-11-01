// 국립국어원 표준국어대사전 오픈 API — 순우리말 목록(app/data/sunwoori.json) 안 낱말이 krdict에 없을 때만 쓴다(D28).
// 일반 검색에는 쓰지 않는다(D10 유지). 뜻풀이가 어른 눈높이라 화면은 기본 '쉬운 말로'로 연다.
//
// 실측(2026-11-02):
//   - search.do?req_type=json → channel.item[] { word:"간들-거리다", target_code:"387182", pos, sense{definition} }
//     결과가 없으면 빈 응답(본문 0바이트).
//   - view.do 는 JSON으로 받으려면 type_search=view 가 있어야 한다(없으면 빈 응답, XML은 없어도 됨).
//     word_info.pos_info[].comm_pattern_info[].sense_info[] { definition, example_info[] { example, source? } }
//   - 하나뿐인 값은 배열이 아니라 객체로 올 때가 있어 asArray로 맞춘다.
import type { DictEntry, DictHomograph, DictSense } from "../../app/types.ts";

const API_BASE = "https://stdict.korean.go.kr/api";
const MAX_HOMOGRAPHS = 4; // krdict와 같은 상한(D22)
const MAX_SENSES = 5;

type Json = Record<string, unknown>;

function asArray<T = Json>(v: unknown): T[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

// 표제어 표기: "간들-거리다" → "간들거리다", "고뿔^" 같은 기호도 뺀다.
function headword(s: unknown): string {
  return String(s ?? "").replace(/[-^]/g, "").trim();
}

// 뜻풀이 정리: 꺾쇠 태그, 동의어 표시(≒간들대다.) 같은 사전 기호를 뺀다.
function cleanDef(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/≒[^.]*\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function stFetch(url: string): Promise<Json | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`stdict HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) return null; // 결과 없음
  return JSON.parse(text) as Json;
}

interface Candidate {
  targetCode: string;
  pos: string | null;
  def: string | null;
}

async function searchExact(key: string, word: string): Promise<Candidate[]> {
  const data = await stFetch(`${API_BASE}/search.do?key=${encodeURIComponent(key)}&q=${encodeURIComponent(word)}&req_type=json&num=20`);
  const items = asArray((data?.channel as Json | undefined)?.item);
  return items
    .filter((it) => headword(it.word) === word && it.target_code)
    .slice(0, MAX_HOMOGRAPHS)
    .map((it) => ({
      targetCode: String(it.target_code),
      pos: it.pos ? String(it.pos) : null,
      def: asArray(it.sense)[0]?.definition ? cleanDef(asArray(it.sense)[0].definition) : null,
    }));
}

// 상세: 모든 뜻과 예문. 예문은 사전이 직접 만든 것(source 없음)만 쓴다 — 표준대사전 저작권 정책상 뜻풀이는
// CC BY-SA 2.0 KR이지만 "출전이 있는 용례는 원저작자가 저작권을 소유"한다(2026-11-02 확인). 문학 작품 인용은
// 초등 눈높이와도 거리가 멀다.
async function viewSenses(key: string, targetCode: string): Promise<DictSense[]> {
  const data = await stFetch(
    `${API_BASE}/view.do?key=${encodeURIComponent(key)}&type_search=view&method=target_code&q=${encodeURIComponent(targetCode)}&req_type=json`,
  );
  const item = asArray((data?.channel as Json | undefined)?.item)[0];
  const wordInfo = item?.word_info as Json | undefined;
  const senses: DictSense[] = [];
  for (const pos of asArray(wordInfo?.pos_info)) {
    for (const pattern of asArray(pos.comm_pattern_info)) {
      for (const sense of asArray(pattern.sense_info)) {
        const def = cleanDef(sense.definition);
        if (!def) continue;
        const examples = asArray(sense.example_info);
        const own = examples.find((ex) => !ex.source && ex.example) ?? null;
        senses.push(own ? { def, example: cleanDef(own.example) } : { def });
      }
    }
  }
  return senses.slice(0, MAX_SENSES);
}

export async function fetchStdictEntry(key: string, word: string): Promise<DictEntry | null> {
  const found = await searchExact(key, word);
  if (found.length === 0) return null;

  const homographs: DictHomograph[] = await Promise.all(
    found.map(async (c) => {
      const senses = await viewSenses(key, c.targetCode).catch(() => [] as DictSense[]);
      // 상세가 비면 검색 결과의 첫 뜻이라도 쓴다.
      const fallback = senses.length ? senses : c.def ? [{ def: c.def }] : [];
      return { pos: c.pos ?? undefined, level: null, senses: fallback, image: null, audio: null };
    }),
  );
  const usable = homographs.filter((h) => h.senses.length > 0);
  if (usable.length === 0) return null;

  const first = usable[0];
  return {
    word,
    pos: first.pos,
    level: null,
    senses: first.senses,
    image: null,
    audio: null,
    homographs: usable.length > 1 ? usable : undefined,
    source: "stdict",
    fetchedAt: new Date().toISOString(),
  };
}
