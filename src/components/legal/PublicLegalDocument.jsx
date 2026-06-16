import React from 'react';
import { Download, FileText } from 'lucide-react';

function lineKind(line) {
  const text = line.trim();
  if (!text) return 'blank';
  if (/^IMPORTANT LEGAL NOTICE/i.test(text)) return 'notice';
  if (/^\d+\.\s/.test(text)) return 'h2';
  if (/^☐/.test(text)) return 'checkbox';
  if (/^[A-Z][A-Z0-9 ,/&;:()|.-]+$/.test(text) && text.length < 130) return 'h1';
  if (/^[A-Z][A-Za-z0-9 ,/&;:()|-]+$/.test(text) && text.length < 90) return 'h3';
  if (/^[A-Za-z /]+ \| /.test(text)) return 'meta';
  return 'p';
}

function LegalText({ text }) {
  return (
    <div className="space-y-3">
      {String(text || '').split('\n').map((line, index) => {
        const kind = lineKind(line);
        const key = `${index}-${line.slice(0, 12)}`;
        if (kind === 'blank') return <div key={key} className="h-2" aria-hidden="true" />;
        if (kind === 'h1') {
          return <h2 key={key} className="pt-3 text-xl font-extrabold leading-tight text-slate-950">{line}</h2>;
        }
        if (kind === 'h2') {
          return <h3 key={key} className="pt-5 text-base font-extrabold leading-7 text-slate-950">{line}</h3>;
        }
        if (kind === 'h3') {
          return <h4 key={key} className="pt-2 text-sm font-bold uppercase tracking-[0.08em] text-slate-700">{line}</h4>;
        }
        if (kind === 'checkbox') {
          return (
            <p key={key} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold leading-6 text-blue-900">
              {line.replace(/^☐\s*/, '')}
            </p>
          );
        }
        if (kind === 'notice') {
          return (
            <p key={key} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">
              {line}
            </p>
          );
        }
        if (kind === 'meta') {
          return <p key={key} className="text-sm font-semibold leading-6 text-slate-700">{line}</p>;
        }
        return <p key={key} className="text-sm leading-7 text-slate-700">{line}</p>;
      })}
    </div>
  );
}

export default function PublicLegalDocument({
  title,
  subtitle,
  document,
  text,
  children,
}) {
  const downloadName = document?.fileName;
  const downloadHref = downloadName ? `/legal/${downloadName}` : '';
  return (
    <div className="bg-white py-14 text-slate-950 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Legal document
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-normal text-slate-950 sm:text-4xl">
                {title}
              </h1>
              {subtitle && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{subtitle}</p>}
              {document && (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Version v{document.version} · Effective June 15, 2026 · {document.jurisdiction}
                </p>
              )}
            </div>
            {downloadHref && (
              <a
                href={downloadHref}
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                DOCX
              </a>
            )}
          </div>
        </div>

        {children}

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <LegalText text={text || document?.body} />
        </article>
      </div>
    </div>
  );
}
