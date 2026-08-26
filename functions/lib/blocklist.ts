// 검색어 로컬 금칙어 프리필터(계획서 §5, D8). byeduin idea-lab.js/madang.js와 같은 1차 방어선 패턴 —
// API 왕복 없이 즉시 차단. 저학년 대상 사전이라 명백한 비속어만 최소 목록으로 시작하고,
// 필요 시 byeduin과 목록을 공유/동기화한다(계획서 §10 리스크).
const BLOCKED = ["씨발", "시발", "개새끼", "병신", "좆", "지랄", "닥쳐", "미친놈", "미친년"];

export function isBlocked(word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  return BLOCKED.some((bad) => w.includes(bad));
}
