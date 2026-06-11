import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, HelpCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/features/marketing/usePageMeta';
import { Reveal } from '@/features/marketing/MarketingMotion';
import { FAQ_GROUPS } from '@/content/faq';

const SUPPORT_EMAIL = 'contact@levelcoachtraining.com';

// Every answer rendered open and in the DOM: this page exists to settle
// objections (and to be findable), not to hide copy behind accordions.
export default function Faq() {
  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_GROUPS.flatMap((group) => group.items).map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }), []);

  usePageMeta({
    title: 'FAQ — LevelCoach Training',
    description: 'Straight answers about booking, payments, cancellations, coach vetting, parent controls, coach payouts, and organization revenue splits on LevelCoach Training.',
    jsonLd,
  });

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-12 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-[920px]">
          <p className="section-num" data-num="01">Frequently asked questions</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">
            Straight answers
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Everything below describes how the platform actually works — booking, money,
            safety, and payouts. If a question isn&rsquo;t answered here,{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-blue-700 hover:underline">email us</a>{' '}
            and a person will reply.
          </p>
          <nav aria-label="FAQ sections" className="mt-6 flex flex-wrap gap-2">
            {FAQ_GROUPS.map((group) => (
              <a
                key={group.id}
                href={`#${group.id}`}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
              >
                {group.label}
              </a>
            ))}
          </nav>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[920px] px-4 py-10 sm:px-6 lg:px-8">
        {FAQ_GROUPS.map((group, index) => (
          <section key={group.id} id={group.id} className="scroll-mt-28 py-6" aria-labelledby={`faq-${group.id}`}>
            <Reveal>
              <p className="section-num" data-num={String(index + 1).padStart(2, '0')}>{group.label}</p>
              <h2 id={`faq-${group.id}`} className="sr-only">{group.label}</h2>
            </Reveal>
            <div className="mt-4 space-y-4">
              {group.items.map((item) => (
                <Reveal key={item.q} as="article" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="flex items-start gap-2.5 text-base font-bold text-slate-950">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                    {item.q}
                  </h3>
                  <p className="mt-2 pl-[26px] text-sm leading-7 text-slate-600">{item.a}</p>
                </Reveal>
              ))}
            </div>
          </section>
        ))}

        <Reveal className="mt-8 flex flex-col items-start justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50/60 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Still have a question?</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Email {SUPPORT_EMAIL} — real replies from the team, not a bot.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email support
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-lg border-blue-200 px-5 font-bold text-blue-700 hover:bg-blue-100">
              <Link to="/support">
                Visit support
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
