// 동음이의어별 이미지 검색 질의를 만들 때 쓰는 아주 가벼운 휴리스틱(D25).
// 한국어 사전 뜻풀이는 관례상 마지막 낱말이 상위어/범주인 경우가 많다
//   "…가슴 아래에서 다리 위까지의 부분." → "부분"
//   "…물 위를 다니는 교통수단."          → "교통수단"
//   "…가을에 나는 둥근 과일."            → "과일"
// 표제어만으로 이미지를 검색하면 동음이의어 중 아무 뜻이나 걸릴 수 있어, 이 힌트를 표제어 뒤에
// 붙여("배 과일") 자유 검색(네이버)에서 원하는 뜻에 더 가까운 결과가 나오게 한다.
// encykorea처럼 표제어 정확 일치만 신뢰하는 API에는 쓰지 않는다(질의를 바꾸면 정확 일치가 깨짐).
// 실측(2026-08-26, "배"): 힌트가 너무 일반적이면(예: 신체 부위 뜻의 "부분") 오히려 이미지 검색이
// 그 낱말의 가장 흔한 뜻(선박)으로 끌려가 버렸다. 그런 낱말/보통명사는 이미지 검색에 아무 신호도
// 못 주므로 힌트로 인정하지 않는다.
const GENERIC_HINTS = new Set([
  "부분", "단위", "것", "정도", "상태", "모양", "경우", "때", "곳",
  "가지", "용도", "이름", "말", "수", "등", "점", "면", "일", "짓", "데",
]);

export function imageCategoryHint(def: string | undefined): string | null {
  if (!def) return null;
  const trimmed = def.trim().replace(/[.!?]+$/, "");
  const tokens = trimmed.split(/[\s,·]+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (!last || last.length < 2 || last.length > 8) return null;
  if (GENERIC_HINTS.has(last)) return null;
  return last;
}

// 동음이의어 이미지 검색용. 힌트가 없으면(=일반명사라 신뢰 못 함) null을 반환해 검색 자체를 생략시킨다 —
// "배"만으로 검색하면 엉뚱한 동음이의어(주로 선박) 사진이 뜨는 게 확인돼서, 애매한 뜻은 사진 없이
// 이니셜 타일로 두는 편이 더 안전하다(정확성 우선, D25).
export function homographImageQuery(word: string, def: string | undefined): string | null {
  const hint = imageCategoryHint(def);
  return hint ? `${word} ${hint}` : null;
}

// 동음이의어가 없는(단일 뜻) 낱말용. 힌트가 없어도 표제어만으로 검색한다 — 애초에 뜻이 하나뿐이라
// disambiguation 문제가 없다.
export function imageSearchQuery(word: string, def: string | undefined): string {
  const hint = imageCategoryHint(def);
  return hint ? `${word} ${hint}` : word;
}
