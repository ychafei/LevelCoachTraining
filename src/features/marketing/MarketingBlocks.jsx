import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Shared, honest marketing primitives for the public "for-*" pages. Every
// block renders only the copy it is given — no fabricated stats or reviews.

export function MarketingHero({ eyebrow, eyebrowIcon: EyebrowIcon, title, highlight, description, primaryCta, secondaryCta, children }) {
  return (
    <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef5ff_100%)]">
      <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-3xl">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700">
              {EyebrowIcon && <EyebrowIcon className="h-4 w-4" aria-hidden="true" />}
              <span className="text-xs font-bold uppercase tracking-[0.18em]">{eyebrow}</span>
            </div>
          )}
          <h1 className="mt-6 font-display text-4xl font-bold leading-tight tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
            {title}{' '}
            {highlight && <span className="text-blue-600">{highlight}</span>}
          </h1>
          {description && (
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{description}</p>
          )}
          {(primaryCta || secondaryCta) && (
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {primaryCta && (
                <Button asChild className="h-12 rounded-lg bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700">
                  <Link to={primaryCta.to}>
                    {primaryCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              {secondaryCta && (
                <Button asChild variant="outline" className="h-12 rounded-lg border-blue-200 bg-white px-6 text-sm font-bold text-blue-700 hover:bg-blue-50">
                  <Link to={secondaryCta.to}>{secondaryCta.label}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

export function BenefitGrid({ eyebrow, title, description, items, columns = 3 }) {
  const colClass = columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p>}
        {title && <h2 className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{title}</h2>}
        {description && <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>}
      </div>
      <div className={`mt-7 grid grid-cols-1 gap-4 ${colClass}`}>
        {items.map(({ title: itemTitle, body, icon: Icon }) => (
          <article key={itemTitle} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            {Icon && (
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{itemTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StepStrip({ title, steps }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {title && <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{title}</p>}
        <div className="mt-4 grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
          {steps.map((step, index) => (
            <div key={step.title} className="py-5 first:pt-0 last:pb-0 md:px-5 md:py-0 md:first:pl-0 md:last:pr-0">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{index + 1}</span>
                {step.icon && (
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection({ title = 'Frequently asked questions', items }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="mx-auto max-w-[920px] px-4 py-10 sm:px-6 lg:px-8">
      <h2 className="font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{title}</h2>
      <div className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
        {items.map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.q}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-slate-950 transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-base"
              >
                {item.q}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {expanded && (
                <p className="px-5 pb-5 text-sm leading-7 text-slate-600">{item.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CtaBand({ title, description, primaryCta, secondaryCta }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-14 sm:px-6 lg:px-8">
      <div className="rounded-lg bg-[#061a3a] px-6 py-10 text-center shadow-lg sm:px-10 sm:py-12">
        <h2 className="font-display text-3xl font-bold tracking-normal text-white sm:text-4xl">{title}</h2>
        {description && <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">{description}</p>}
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {primaryCta && (
            <Button asChild className="h-12 rounded-lg bg-blue-600 px-7 text-sm font-bold text-white hover:bg-blue-500">
              <Link to={primaryCta.to}>
                {primaryCta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
          {secondaryCta && (
            <Button asChild variant="outline" className="h-12 rounded-lg border-blue-300/40 bg-transparent px-7 text-sm font-bold text-white hover:bg-white/10 hover:text-white">
              <Link to={secondaryCta.to}>{secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
