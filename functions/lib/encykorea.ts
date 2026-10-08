// 한국민족문화대백과사전(한국학중앙연구원) Open API — krdict 미수록/이미지 없음일 때의 2차 보완(D20).
// 사용법(사용자 제공): X-Api-Key 헤더 인증, 검색은 부분일치이므로 headword 정확 일치만 신뢰한다.
//
// 실측(2026-08-26): "사과"·"나비"·"온돌" 같은 기초 낱말은 표제어가 없다(복합어·전문어 위주 백과사전,
// 예: 온돌 대신 "온돌문화"). 그래서 이 소스는 krdict가 이미 커버하는 기초어휘에는 거의 안 걸리고,
// krdict에 없는 문화·역사·전문 용어에서만 드물게 히트하는 게 정상 — 그게 이 폴백의 설계 의도다.
// 이미지 URL은 krdict와 달리 래퍼 페이지 없이 바로 https://devin.aks.ac.kr/image/{mid}?preset=orig.
import type { DictImage } from "../../app/types.ts";

const BASE = "https://devin.aks.ac.kr:8080/api";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 edu-dic/1.0";

interface EncyMedia {
  url: string;
  caption?: string;
  copyrightDisplay?: string;
  koglType?: string;
}

interface EncyArticle {
  headword: string;
  field?: string; // 예: "생활/식생활" — pos 배지 자리에 재사용
  definition?: string;
  summary?: string;
  headMedia?: EncyMedia | null;
}

export interface EncyResult {
  def: string;
  field?: string;
  image: DictImage | null;
}

// 표제어(headword)가 정확히 일치하는 첫 항목만 신뢰한다(부분일치 검색 결과를 그대로 보여주면
// 완전히 다른 낱말의 전문 정의가 뜰 위험이 크다 — krdict 동음이의어 함정보다 훨씬 넓은 함정).
export async function searchEncykorea(key: string, word: string): Promise<EncyResult | null> {
  const url = `${BASE}/articles/search?q=${encodeURIComponent(word)}&p=1&ps=20`;
  const res = await fetch(url, { headers: { "X-Api-Key": key, "user-agent": UA }, signal: AbortSignal.timeout(3000) });
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: EncyArticle[] };
  const items = data.items ?? [];
  const exact = items.find((it) => it.headword === word && ((it.definition ?? "").trim() || (it.summary ?? "").trim()));
  if (!exact) return null;

  const def = (exact.definition ?? "").trim() || (exact.summary ?? "").trim();
  if (!def) return null;

  let image: DictImage | null = null;
  if (exact.headMedia?.url) {
    image = {
      url: exact.headMedia.url,
      license: exact.headMedia.koglType ? `공공누리 ${exact.headMedia.koglType}` : "공공누리",
      attribution: `출처: 한국민족문화대백과사전${exact.headMedia.copyrightDisplay ? `(${exact.headMedia.copyrightDisplay})` : ""}`,
      source: "encykorea",
    };
  }

  return { def, field: exact.field, image };
}
