// 사전 항목 우리 표준형(계획서 §2.4). krdict 응답을 이 형태로 정규화한다.
export interface DictSense {
  def: string; // 쉬운 정의 문장
  example?: string; // 예문(선택)
}

export interface DictImage {
  url: string;
  license: string; // 예: 'CC BY-SA 2.0 KR' | '공공누리 KOGL1' | '네이버 이미지 검색'
  attribution: string; // 출처표시 문구(이미지 하단 소표기)
  source: "krdict" | "encykorea" | "naver"; // krdict/encykorea=검수된 자료, naver=미검수 웹 이미지 폴백(D4 예외, D24 카카오→네이버 교체)
}

export interface DictAudio {
  url: string;
  license: string; // 'CC BY-NC-ND 2.0 KR' — 이미지(CC BY-SA)와 라이선스 다름(비상업·변경 금지)
  attribution: string;
}

// 동음이의어 한 개의 뜻 묶음(예: 배¹=신체, 배²=선박, 배³=과일). D22.
export interface DictHomograph {
  pos?: string;
  level?: "초급" | "중급" | "고급" | null;
  senses: DictSense[];
  image?: DictImage | null;
  audio?: DictAudio | null;
  easySenses?: DictSense[] | null; // 이 동음이의어 전용 "쉬운 말" 변환본(D25 — 탭별로 따로 캐시).
  imagePending?: boolean; // 사진(encykorea·네이버) 보완을 아직 안 함 — /api/image가 채운다(docs/perf-plan.md §2.2).
}

export interface DictEntry {
  word: string; // 표제어
  reading?: string; // 발음/읽기
  pos?: string; // 품사 — homographs[0]과 동일(하위 호환용 최상위 필드)
  level?: "초급" | "중급" | "고급" | null; // 어휘등급 — homographs[0]과 동일
  senses: DictSense[]; // 뜻풀이(대표부터) — homographs[0]과 동일
  image?: DictImage | null; // 대표 이미지 1장 — homographs[0]과 동일
  audio?: DictAudio | null; // 발음 소리(있으면) — homographs[0]과 동일
  homographs?: DictHomograph[]; // 동음이의어가 2개 이상일 때만 채움(D22) — [0]이 위 최상위 필드와 같은 것
  easySenses?: DictSense[] | null; // AI 변환: 사전 뜻풀이를 그대로(스켈레톤) 쉬운 말로만 다시 쓴 것. 캐시됨.
  related?: string[] | null; // AI 제안 관련어 — krdict에 실제 있는 낱말만 검증 후 저장. 캐시됨.
  imagePending?: boolean; // 대표(단일 뜻) 사진 보완 대기 — homographs가 있으면 각 항목의 imagePending을 본다.
  source: "krdict" | "encykorea"; // krdict 미수록일 때만 encykorea 텍스트로 대체(D20). 화면에 출처를 다르게 표시.
  fetchedAt: string;
}

// /api/lookup 응답 형태(디스크리미네이티드 유니언)
export type LookupResult =
  | { status: "ok"; entry: DictEntry }
  | { status: "not_found"; word: string; suggestion?: string } // 사전 미수록 → "준비 중" 안내(D10). suggestion=네이버 오타 변환(krdict로 검증됨, D29)
  | { status: "not_ready"; word: string } // M0 스텁: 백엔드 미연결
  | { status: "blocked"; word: string } // 금칙어 프리필터 차단(D8)
  | { status: "error"; word: string; message: string };

// 상단 난이도 토글(D17-2). 기본값은 항상 "dict"(사전 원문 — AI 개입 없음, 가장 안전).
export type ReadingLevel = "dict" | "easy";

// 사용자(교사) 정의 관심 주제 세트 (PLAN.md §13)
export interface CustomWordSet {
  id: string;
  title: string;
  emoji: string;
  words: string[];
  createdAt: string;
  isShared?: boolean; // 공유받은 주제 여부
}

