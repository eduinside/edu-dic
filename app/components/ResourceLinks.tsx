import { ExternalLink } from "lucide-react";

// 함께 보면 좋은 곳(외부, 새 창). edu-kit의 ResourceLinks.tsx와 상호 링크 관계 — 대구교육 워크스페이스
// 정본 프로젝트들을 서로 소개한다.
const LINKS = [
  { href: "https://kit.dgedu.link/", title: "수업꾸러미", desc: "학년·학기·교과·단원으로 찾는 수업 콘텐츠." },
  { href: "https://map.dgedu.link/", title: "에듀맵스", desc: "현장체험과 온라인 학습 자원을 찾아보세요." },
  { href: "https://ssac.dgedu.link/", title: "개념튼튼 ON싹", desc: "학년별 어휘와 개념을 스스로 익혀요." },
] as const;

export default function ResourceLinks({ heading }: { heading?: string }) {
  return (
    <div>
      {heading ? <h2 className="mb-2.5 text-left text-xs font-extrabold tracking-wide text-ink-faint">{heading}</h2> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="resource-link flex items-start gap-2.5 rounded-2xl border border-line bg-white p-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-brand-700">{l.title}</span>
                <ExternalLink className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
              </div>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-ink-soft">{l.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
