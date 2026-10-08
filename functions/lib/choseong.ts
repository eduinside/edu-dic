// 한글 초성 분해 및 초성/접두사 검색 유틸리티

const CHOSEONG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const HANGUL_START = 0xac00; // '가'
const HANGUL_END = 0xd7a3;   // '힣'

/**
 * 주어진 문자열에서 한글 음절의 초성을 추출합니다.
 * 한글 음절이 아닌 문자(숫자, 공백, 기호, 이미 초성인 자음 등)는 그대로 유지합니다.
 * 예: "고양이" -> "ㄱㅇㅇ", "1학년" -> "1ㅎㄴ"
 */
export function extractChoseong(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const choseongIndex = Math.floor((code - HANGUL_START) / 588);
      result += CHOSEONG_LIST[choseongIndex];
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * 입력 검색어가 초성 자음으로만 구성되어 있는지 확인합니다.
 * 예: "ㄱㅇ" -> true, "고양" -> false, "ㄱ1" -> false
 */
export function isChoseongOnly(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (!CHOSEONG_LIST.includes(char)) {
      return false;
    }
  }
  return true;
}

/**
 * 대상 단어가 검색어와 매칭되는지 판별합니다.
 * 1. 검색어가 초성만 있는 경우: 대상 단어의 초성과 검색어 초성 비교 (시작 일치 또는 포함)
 * 2. 일반 검색어인 경우: 대상 단어가 검색어로 시작하거나 포함하는지 비교
 */
export function matchesChoseongOrPrefix(word: string, query: string): boolean {
  const cleanWord = word.trim().toLowerCase();
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery || !cleanWord) return false;

  if (isChoseongOnly(cleanQuery)) {
    const wordChoseong = extractChoseong(cleanWord);
    return wordChoseong.startsWith(cleanQuery) || wordChoseong.includes(cleanQuery);
  }

  return cleanWord.startsWith(cleanQuery) || cleanWord.includes(cleanQuery);
}

/**
 * 자동완성 순위. 서버(/api/suggest)와 브라우저(SearchBox 즉시 추천)가 같은 규칙을 쓴다.
 * 1순위: 표제어가 검색어로 시작(완전 일치는 맨 앞) / 2순위: 초성이 검색어 초성으로 시작 / 3순위: 표제어·초성에 포함.
 * 같은 순위 안에서는 words에 들어온 순서를 지킨다.
 */
export function rankSuggestions(words: Iterable<string>, query: string, limit = 10): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isChoseong = isChoseongOnly(q);
  const qChoseong = extractChoseong(q);
  const exactPrefix: string[] = [];
  const choseongPrefix: string[] = [];
  const contains: string[] = [];

  for (const word of new Set(words)) {
    const wordLower = word.toLowerCase();
    const wordChoseong = extractChoseong(wordLower);
    if (isChoseong) {
      if (wordChoseong.startsWith(q)) choseongPrefix.push(word);
      else if (wordChoseong.includes(q)) contains.push(word);
    } else if (wordLower === q) {
      exactPrefix.unshift(word);
    } else if (wordLower.startsWith(q)) {
      exactPrefix.push(word);
    } else if (wordChoseong.startsWith(qChoseong)) {
      choseongPrefix.push(word);
    } else if (wordLower.includes(q) || matchesChoseongOrPrefix(word, q)) {
      contains.push(word);
    }
  }
  return [...exactPrefix, ...choseongPrefix, ...contains].slice(0, limit);
}
