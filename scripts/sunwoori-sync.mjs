// 순우리말 목록 만들기(D28, docs/plan-sunwoori.md §5).
//
// 충북교육문화원 한글사랑관 '순우리말' 게시판의 글 제목(= 낱말)·글번호·등록일만 읽어 온다.
// 소개말·예문은 옮기지 않는다(공공누리 표시 없음, 시판 도서 출처 — plan §1.1). 뜻은 화면에서 국어원 사전으로 본다.
//
// 낱말마다 확인하는 것:
//   - 표준국어대사전 수록 여부·품사 → 없으면 목록에서 뺀다(뜻을 보여 줄 수 없음)
//   - 한국어기초사전 수록 여부·어휘 등급 → '쉬운 낱말' 보기에 쓴다. krdict가 안 되면 null(확인 못 함)로 둔다.
// 이미 있는 app/data/sunwoori.json 값을 다시 쓰고 새 낱말만 확인한다. --recheck 면 전부 다시 확인.
//
// 실행: node scripts/sunwoori-sync.mjs [--recheck]   (달마다 새 글이 올라오면 한 번 돌려 커밋)
// 키: .dev.vars 의 KRDICT_API_KEY / STDICT_API_KEY. STDICT 키가 없으면 표준대사전 누리집 검색 결과로 확인한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "app/data/sunwoori.json");
const OUT_LATEST = path.join(ROOT, "app/data/sunwoori-latest.json");
const LIST_URL = "https://www.cbec.go.kr/hangeul/sub.php?menukey=223";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 edu-dic/1.0";
const RECHECK = process.argv.includes("--recheck");

function readVars() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, ".dev.vars"), "utf8");
    const vars = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m) vars[m[1]] = m[2];
    }
    return vars;
  } catch {
    return {};
  }
}

async function get(url, timeoutMs = 10000) {
  for (let t = 0; t < 2; t++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.text();
    } catch {
      /* 한 번 더 */
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 표제어 비교용: 붙임표(-)·어깨번호·^ 등을 뺀다. "간들-거리다" → "간들거리다"
const norm = (s) => s.replace(/<[^>]*>/g, "").replace(/[-^·\s\d]/g, "").trim();

// 1) 게시판 목록 — 빈 쪽이 나올 때까지
async function readBoard() {
  const posts = [];
  for (let page = 1; page < 200; page++) {
    const html = await get(`${LIST_URL}&page=${page}`);
    if (!html) throw new Error(`목록 ${page}쪽을 못 읽었어요`);
    const flat = html.replace(/[\r\n\t]+/g, " ");
    const rows = [...flat.matchAll(/mod=view&amp;no=(\d+)[^>]*>([^<]+)<\/a>.*?class="data b_date">(\d{4})\/(\d{2})\/(\d{2})</g)];
    if (rows.length === 0) break;
    for (const [, no, title, y, m, d] of rows) posts.push({ no: Number(no), title: title.trim(), date: `${y}-${m}-${d}` });
    await sleep(150);
  }
  return posts;
}

// 제목 → 낱말들. 옛 글은 "맛문하다, 보지락, 밉둥, 꼲다, 툭지다 -" 처럼 다섯 개씩, 짝 글은 "간간하다와 밍밍하다".
function splitTitle(title) {
  return title
    .replace(/\([^)]*\)/g, "") // "는개(비 이름 중 하나)"
    .replace(/[.!?]/g, "")
    .split(/,|(?<=[가-힣])(?:와|과) /)
    .map((w) => w.replace(/[\s-]+$/g, "").replace(/^[\s-]+/g, "").trim())
    .filter((w) => w && w.length <= 12 && /^[가-힣\s]+$/.test(w));
}

// 묶음 글("길과 관련된 순 우리말", "행동거지를 나타내는 말 3")은 제목이 낱말이 아니다.
// 본문이 "★ 큰춤보다 - 뜻…", "※ 난바다 - 뜻…", "○ 군불 - 뜻…" 꼴이라 표시 기호 뒤의 표제어만 뽑는다(뜻은 안 가져옴).
// '뒷말'처럼 '말'로 끝나는 낱말이 있어 띄어 쓴 '말'·'우리말'로 끝날 때만 묶음 글로 본다.
const isThemeTitle = (t) => /관련|관계|나타내는|것들|\s(?:우리)?말\s*\d*$|\s\S+들$|\s이름$/.test(t);

async function readThemeWords(no) {
  const html = await get(`${LIST_URL}&mod=view&no=${no}`);
  if (!html) return [];
  // '첨부'는 표 설명에도 나와서, 본문은 '다음글' 앞에서 마지막 '첨부' 뒤부터다.
  const body = html.replace(/[\r\n\t]+/g, " ").split("다음글")[0].split("첨부").pop() ?? "";
  const text = body.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#39;|&quot;/g, " ");
  // 글마다 기호가 다르다(★ ※ ○ ◇ ♥ …). 글자·숫자·문장부호가 아닌 기호 뒤 "낱말 - " 꼴이면 표제어로 본다.
  const words = [...text.matchAll(/[^\s가-힣A-Za-z0-9.,;:'"()[\]「」-]\s*([가-힣][가-힣 ]{0,10}?)\s*[-:–]\s/g)].map((m) =>
    m[1].trim(),
  );
  return [...new Set(words)];
}

// 2-a) 표준국어대사전 — API 키가 있으면 API, 없으면 누리집 검색 결과
async function checkStdict(word, key) {
  if (key) {
    const raw = await get(
      `https://stdict.korean.go.kr/api/search.do?key=${key}&q=${encodeURIComponent(word)}&req_type=json&num=20`,
    );
    if (raw === null) return undefined;
    if (!raw.trim()) return null; // 결과 없음은 빈 응답
    try {
      const items = [].concat(JSON.parse(raw)?.channel?.item ?? []);
      const hits = items.filter((it) => norm(String(it.word)) === word);
      if (hits.length === 0) return null;
      // 같은 이름의 다른 낱말(출출하다: 동사 '넘치다' / 형용사 '배고프다')이 있으면 품사를 모두 적는다.
      const pos = [...new Set(hits.map((it) => it.pos).filter((p) => p && p !== "품사 없음"))].join("·");
      return { pos: pos || null };
    } catch {
      return undefined;
    }
  }
  const html = await get(`https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=${encodeURIComponent(word)}`);
  if (html === null) return undefined;
  const flat = html.replace(/[\r\n\t]+/g, " ");
  for (const m of flat.matchAll(/searchView\.do\?word_no=\d+[^>]*class="t_blue1">(.*?)<\/a>.*?「([^」]+)」/g)) {
    if (norm(m[1]) === word) return { pos: m[2] };
  }
  return null;
}

// 2-b) 한국어기초사전 — 표제어 정확 일치 + 어휘 등급. 안 되면 undefined(확인 못 함).
async function checkKrdict(word, key) {
  const xml = await get(
    `https://krdict.korean.go.kr/api/search?key=${key}&q=${encodeURIComponent(word)}&part=word&sort=popular&num=20`,
    8000,
  );
  if (xml === null) return undefined;
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  for (const it of items) {
    const w = it.match(/<word>\s*(?:<!\[CDATA\[)?([^<\]]*)/)?.[1]?.trim();
    if (w === word) {
      const g = it.match(/<word_grade>\s*(?:<!\[CDATA\[)?([^<\]]*)/)?.[1]?.trim();
      return { grade: g && g !== "없음" ? g : null };
    }
  }
  return null;
}

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

async function main() {
  const vars = readVars();
  const prev = (() => {
    try {
      return JSON.parse(fs.readFileSync(OUT, "utf8"));
    } catch {
      return { words: [], missing: [] };
    }
  })();
  const prevBy = new Map(prev.words.map((x) => [x.w, x]));
  const prevMissing = new Set(prev.missing ?? []);

  console.log("게시판 목록 읽는 중…");
  const posts = await readBoard();
  console.log(`글 ${posts.length}개`);

  // 같은 낱말이 여러 글에 있으면 가장 최근 글 하나만
  const byWord = new Map();
  const themes = posts.filter((p) => isThemeTitle(p.title));
  console.log(`묶음 글 ${themes.length}개 본문에서 표제어 뽑는 중…`);
  const themeWords = new Map();
  for (const p of themes) {
    themeWords.set(p.no, await readThemeWords(p.no));
    await sleep(150);
  }
  for (const p of posts) {
    for (const w of themeWords.get(p.no) ?? splitTitle(p.title)) {
      const cur = byWord.get(w);
      if (!cur || p.date > cur.d || (p.date === cur.d && p.no > cur.no)) byWord.set(w, { w, no: p.no, d: p.date });
    }
  }
  const words = [...byWord.values()];
  console.log(`낱말 ${words.length}개`);

  // krdict가 되는지 한 번만 본다(2026-11-02 실측: 몇 시간씩 응답이 없을 때가 있다).
  let krOk = false;
  if (vars.KRDICT_API_KEY) krOk = (await checkKrdict("나무", vars.KRDICT_API_KEY)) !== undefined;
  console.log(`기초사전: ${krOk ? "확인함" : "응답 없음 → 이전 값 유지"}`);

  const out = [];
  const missing = [];
  let done = 0;
  await pool(words, 4, async (x) => {
    const old = prevBy.get(x.w);
    let pos = old?.pos ?? null;
    let inStd = old ? true : prevMissing.has(x.w) ? false : undefined;
    if (RECHECK || inStd === undefined) {
      const r = await checkStdict(x.w, vars.STDICT_API_KEY);
      if (r !== undefined) {
        inStd = !!r;
        pos = r?.pos && r.pos !== "품사 없음" ? r.pos : null;
      }
    }
    let kr = old?.kr ?? null;
    let g = old?.g ?? null;
    if (krOk && (RECHECK || kr === null)) {
      const r = await checkKrdict(x.w, vars.KRDICT_API_KEY);
      if (r !== undefined) {
        kr = !!r;
        g = r?.grade ?? null;
      }
    }
    // 표준대사전에도 기초사전에도 없다고 확인된 낱말만 뺀다. 확인을 못 했으면(undefined) 일단 넣는다.
    if (inStd === false && kr !== true) missing.push(x.w);
    else out.push({ ...x, pos, kr, g });
    if (++done % 50 === 0) console.log(`  ${done}/${words.length}`);
    await sleep(100);
  });

  out.sort((a, b) => (a.d === b.d ? b.no - a.no : a.d < b.d ? 1 : -1));
  missing.sort((a, b) => a.localeCompare(b, "ko"));
  const data = {
    source: { name: "충청북도교육문화원 한글사랑관 순우리말", url: LIST_URL },
    updated: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    words: out,
    missing, // 국어원 사전 두 곳 모두에 없어 뺀 낱말(다음 실행 때 다시 묻지 않으려고 남김)
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  fs.writeFileSync(OUT_LATEST, JSON.stringify(out[0] ?? null) + "\n");
  const krKnown = out.filter((x) => x.kr !== null).length;
  console.log(
    `완료: ${out.length}개 저장, ${missing.length}개 뺌, 기초사전 수록 ${out.filter((x) => x.kr).length}개(확인 ${krKnown}개)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
