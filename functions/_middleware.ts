// *.pages.dev 기본 도메인으로 들어오면 정본 도메인(dic.dgedu.link)으로 301 리다이렉트한다.
// (워크스페이스 규칙: pages.dev를 최종 URL로 안내하지 않음 — dev-hub의 workers.dev→dash.eduin.info
// 리다이렉트와 동일 패턴.) 로컬 개발(localhost)·커스텀 도메인 자체 요청은 그대로 통과.
export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.hostname.endsWith(".pages.dev")) {
    url.hostname = "dic.dgedu.link";
    url.port = "";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  return next();
};
