// 순우리말 목록(D28) — 서버는 "이 낱말이 목록에 있나"만 본다(표준대사전 폴백을 목록 안 낱말로 한정).
// 목록은 scripts/sunwoori-sync.mjs 가 만든다.
import data from "../../app/data/sunwoori.json";

const WORDS = new Set<string>((data.words as { w: string }[]).map((x) => x.w));

export function isSunwoori(word: string): boolean {
  return WORDS.has(word.trim());
}
