// krdict 응답(XML)에서 필요한 값만 뽑아내는 경량 추출기.
// 대상 태그는 자기 자신을 재귀적으로 중첩하지 않으므로(계획서 §2.2 확인) 정규식 스캔으로 충분하고,
// CF Pages 무료 CPU(요청당 10ms) 예산상 범용 XML/DOM 파서를 들여오지 않는다.

export function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

export function extractFirst(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : null;
}

// 태그 안이 비어 있거나(self-closing 유사) 공백뿐이면 없는 것으로 취급(krdict 응답은 빈 값도 태그를 남김).
export function textOrNull(v: string | null): string | null {
  if (v == null) return null;
  const t = decodeXmlEntities(v).trim();
  return t.length ? t : null;
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// 최상위 <item>...</item> 블록만 잘라낸다(중첩 sense_info 등은 블록 내부에서 다시 추출).
export function extractItems(xml: string): string[] {
  return extractAll(xml, "item");
}
