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
  "하나", "사람", "이", "그", "저", "어떤",
]);

const CATEGORY_KEYWORDS = [
  "이십사절기", "24절기", "절기", "계절", "날씨", "이슬", "서리", "바람",
  "식물", "채소", "과일", "꽃", "나무", "풀", "열매", "곡식",
  "동물", "포유류", "조류", "새", "곤충", "벌레", "물고기", "어류", "생물",
  "음식", "요리", "반찬", "간식", "음료",
  "도구", "학용품", "가구", "가전", "의류", "옷", "신발", "장신구", "모자",
  "탈것", "교통수단", "자동차", "비행기", "선박",
  "건물", "장소", "시설", "악기", "놀이", "운동", "스포츠",
  "자연", "바다", "산", "강", "하늘", "우주", "행성",
];

export function imageCategoryHint(def: string | undefined): string | null {
  if (!def) return null;
  const cleanDef = def.replace(/<[^>]+>/g, " ").trim();

  // 1. 특정 주요 범주 키워드가 정의에 포함되어 있으면 우선 매칭
  for (const cat of CATEGORY_KEYWORDS) {
    if (cleanDef.includes(cat)) {
      if (cat === "이십사절기" || cat === "24절기") return "절기";
      return cat;
    }
  }

  // 2. 첫 문장의 마지막 핵심 명사 추출 (서술격 조사, 종결 어미 등 제거)
  const trimmed = cleanDef.replace(/[.!?]+$/, "");
  const sentences = trimmed.split(/[.;]/).filter(Boolean);
  const firstSentence = sentences[0]?.trim() || trimmed;

  const words = firstSentence.split(/[\s,·]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    let w = words[i].replace(/[0-9]+.*$/, "").replace(/(이다|하다|한다|경이다|때이다|말이다|것이다|따위다|부분이다)$/, "");
    w = w.replace(/(을|를|이|가|의|에|에서|로|으로|와|과|도|만|나|이나)$/, "").trim();
    if (w.length >= 2 && w.length <= 8 && !GENERIC_HINTS.has(w)) {
      return w;
    }
  }

  return null;
}

// 동음이의어 이미지 검색용. 힌트가 없으면(=일반명사라 신뢰 못 함) null을 반환해 검색 자체를 생략시킨다 —
// "배"만으로 검색하면 엉뚱한 동음이의어(주로 선박) 사진이 뜨는 게 확인돼서, 애매한 뜻은 사진 없이
// 이니셜 타일로 두는 편이 더 안전하다(정확성 우선, D25).
export function homographImageQuery(word: string, def: string | undefined): string | null {
  const hint = imageCategoryHint(def);
  return hint ? `${word} ${hint}` : null;
}

// 동음이의어가 없는(단일 뜻) 낱말용. 힌트가 있으면 조합 쿼리를 구성하여 네이버 검색 정확도를 대폭 높인다.
export function imageSearchQuery(word: string, def: string | undefined): string {
  const hint = imageCategoryHint(def);
  return hint ? `${word} ${hint}` : word;
}

