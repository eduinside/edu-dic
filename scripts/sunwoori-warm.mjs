// 순우리말 목록(app/data/sunwoori.json) 낱말을 운영 D1 캐시에 미리 채운다(D28) — 학생이 처음 누를 때 사전·사진·AI를
// 기다리지 않게. 운영 API를 그대로 부르므로 서버 쪽 규칙(금칙어, 표준대사전은 목록 안 낱말만, 사진 심사)이 똑같이 걸린다.
//
//   node scripts/sunwoori-warm.mjs                 # 운영(dic.dgedu.link)
//   node scripts/sunwoori-warm.mjs --base http://localhost:8788
//   node scripts/sunwoori-warm.mjs --no-ai         # 뜻·사진만(쉬운 말·함께 알면 좋은 낱말은 건너뜀)
//   node scripts/sunwoori-warm.mjs --write-kr      # 운영 응답으로 sunwoori.json 의 기초사전 수록 여부(kr·g)를
//                                                  # 채우고 오늘의 순우리말 후보(sunwoori-daily.json)도 다시 만든다
//
// --write-kr 는 이 PC에서 기초사전을 직접 못 부를 때 쓴다(2026-11-02 sync --recheck 중 이 PC가 몇 시간 막힘 —
// 운영 서버는 정상). 운영이 krdict 뜻을 돌려주면 수록, 표준대사전 뜻이면 미수록으로 본다.
//
// 낱말마다: ① /api/lookup(prefetch=1 — 인기 집계에서 뺌, defer 없이 — 사진까지 채워 저장)
//          ② 표준대사전 뜻이면 /api/simplify(이 낱말은 화면이 '쉬운 말로'로 연다)
//          ③ /api/related(결과 화면 아래 '함께 알면 좋은 낱말')
// 이미 채운 낱말은 서버가 캐시에서 바로 돌려주므로 다시 돌려도 된다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BASE = (args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://dic.dgedu.link").replace(/\/$/, "");
const NO_AI = args.includes("--no-ai");
const WRITE_KR = args.includes("--write-kr");
const DATA = path.join(ROOT, "app/data/sunwoori.json");
const DAILY = path.join(ROOT, "app/data/sunwoori-daily.json");
const WORKERS = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(pathname, timeout = 60000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BASE + pathname, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
      return await res.json();
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const { words } = data;
const seen = new Map(); // 낱말 → 운영이 돌려준 { source, level }
const count = { krdict: 0, stdict: 0, encykorea: 0, not_found: 0, error: 0, image: 0, easy: 0, related: 0 };
const failed = [];
let next = 0;
let done = 0;
const started = Date.now();

async function worker() {
  while (next < words.length) {
    const w = words[next++].w;
    const q = encodeURIComponent(w);
    const r = await get(`/api/lookup?q=${q}&prefetch=1`);
    if (r?.status === "ok") {
      const e = r.entry;
      seen.set(w, { source: e.source, level: e.level ?? null });
      count[e.source] = (count[e.source] ?? 0) + 1;
      if (e.image || e.homographs?.some((h) => h.image)) count.image++;
      if (!NO_AI) {
        if (e.source === "stdict" && !e.easySenses) {
          const s = await get(`/api/simplify?q=${q}&h=0`);
          if (s?.easySenses) count.easy++;
        }
        const rel = await get(`/api/related?q=${q}`);
        if (rel?.words?.length) count.related++;
      }
    } else if (r?.status === "not_found") {
      count.not_found++;
      failed.push(`${w}\tnot_found`);
    } else {
      count.error++;
      failed.push(`${w}\t${r?.message ?? "응답 없음"}`);
    }
    if (++done % 50 === 0) {
      const min = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  ${done}/${words.length} (${min}분) ${JSON.stringify(count)}`);
    }
    await sleep(200);
  }
}

console.log(`${BASE} 에 ${words.length}개 채우기${NO_AI ? " (AI 없이)" : ""}`);
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`완료 ${((Date.now() - started) / 60000).toFixed(1)}분: ${JSON.stringify(count)}`);
const failedOut = path.join(ROOT, "scripts/.sunwoori-warm-failed.tsv");
if (failed.length) {
  fs.writeFileSync(failedOut, failed.join("\n") + "\n");
  console.log(`못 채운 낱말 ${failed.length}개 → ${path.relative(ROOT, failedOut)}`);
} else {
  fs.rmSync(failedOut, { force: true }); // 지난번 실패 목록이 남아 헷갈리지 않게
}

// sunwoori-sync.mjs 와 같은 섞는 차례(FNV-1a) — 두 스크립트가 만든 후보 파일이 같게.
function fnv(str) {
  let h = 0x811c9dc5;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h;
}

if (WRITE_KR) {
  let changed = 0;
  for (const x of words) {
    const r = seen.get(x.w);
    if (!r) continue; // 오류·없음은 이전 값 그대로
    const kr = r.source === "krdict";
    const g = kr ? r.level : null;
    if (x.kr !== kr || x.g !== g) changed++;
    x.kr = kr;
    x.g = g;
  }
  fs.writeFileSync(DATA, JSON.stringify(data, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  const krWords = words.filter((x) => x.kr === true);
  const daily = (krWords.length ? krWords : words).map((x) => x.w).sort((a, b) => fnv(a) - fnv(b) || a.localeCompare(b, "ko"));
  fs.writeFileSync(DAILY, JSON.stringify(daily) + "\n");
  console.log(`기초사전 수록 여부 ${changed}개 바뀜 — 수록 ${krWords.length}개, 오늘의 순우리말 후보 ${daily.length}개`);
}
