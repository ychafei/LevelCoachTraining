import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal, Stagger, GradientImage, HeroPattern } from '@/features/marketing/MarketingMotion';

// Shared, honest marketing primitives for the public "for-*" pages. Every
// block renders only the copy it is given — no fabricated stats or reviews.
// Visual polish (gradients, imagery, motion) is layered in here so all four
// audience pages share one premium design language.

export function MarketingHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  highlight,
  description,
  primaryCta,
  secondaryCta,
  image,
  highlights,
  children,
}) {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_12%_0%,#102a5c_0%,#081226_58%,#05080f_100%)] text-white">
      <HeroPattern className="text-white/[0.07]" />
      <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className={image ? 'grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10' : 'max-w-3xl'}>
          <Reveal as="div" y={20}>
            {eyebrow && (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                {EyebrowIcon && <EyebrowIcon className="h-4 w-4 text-blue-300" aria-hidden="true" />}
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">{eyebrow}</span>
              </div>
            )}
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {title}{' '}
              {highlight && (
                <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                  {highlight}
                </span>
              )}
            </h1>
            {description && (
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{description}</p>
            )}
            {(primaryCta || secondaryCta) && (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {primaryCta && (
                  <Button asChild className="h-12 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500">
                    <Link to={primaryCta.to}>
                      {primaryCta.label}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                {secondaryCta && (
                  <Button asChild variant="outline" className="h-12 rounded-xl border-white/25 bg-white/5 px-6 text-sm font-bold text-white hover:bg-white/10 hover:text-white">
                    <Link to={secondaryCta.to}>{secondaryCta.label}</Link>
                  </Button>
                )}
              </div>
            )}
            {highlights && highlights.length > 0 && (
              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                {highlights.map(({ label, icon: Icon }) => (
                  <li key={label} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                    {Icon && <Icon className="h-4 w-4 text-blue-300" aria-hidden="true" />}
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </Reveal>

          {image && (
            <Reveal as="div" y={24} delay={0.1} className="hidden lg:block">
              <div className="relative">
                <GradientImage
                  src={image.src}
                  alt={image.alt}
                  eager
                  className="aspect-[5/6] rounded-3xl shadow-2xl shadow-blue-900/30 ring-1 ring-white/30"
                  gradientClassName="bg-[linear-gradient(135deg,#0b2350_0%,#13357a_45%,#2563eb_100%)]"
                  overlayClassName="bg-gradient-to-t from-slate-950/40 via-transparent to-transparent"
                />
                {image.badge && (
                  <div className="absolute -bottom-4 -left-4 w-[min(18rem,85%)] rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl shadow-blue-900/25 backdrop-blur">
                    <div className="flex items-center gap-3">
                      {image.badge.icon && (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                          <image.badge.icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-bold leading-tight text-slate-950">{image.badge.title}</p>
                        <p className="text-xs leading-snug text-slate-500">{image.badge.subtitle}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />
    </section>
  );
}

export function BenefitGrid({ eyebrow, title, description, items, columns = 3 }) {
  const colClass = columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
      <Reveal className="max-w-3xl">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p>}
        {title && <h2 className="mt-2 font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{title}</h2>}
        {description && <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>}
      </Reveal>
      <Stagger className={`mt-8 grid grid-cols-1 gap-4 ${colClass}`}>
        {items.map(({ title: itemTitle, body, icon: Icon }) => (
          <Stagger.Item key={itemTitle}>
            <article className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10">
              {Icon && (
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <h3 className="mt-4 font-display text-xl font-bold tracking-normal text-slate-950">{itemTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          </Stagger.Item>
        ))}
      </Stagger>
    </section>
  );
}

export function StepStrip({ title, steps }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-12 sm:px-6 lg:px-8">
      <Reveal>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {title && <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{title}</p>}
          <div className="mt-5 grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
            {steps.map((step, index) => (
              <div key={step.title} className="py-5 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">{index + 1}</span>
                  {step.icon && (
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
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
      </Reveal>
    </section>
  );
}

export function FaqSection({ title = 'Frequently asked questions', items }) {
  const [open, setOpen] = useState(null);
  return (
    <section className="mx-auto max-w-[920px] px-4 py-12 sm:px-6 lg:px-8">
      <Reveal>
        <h2 className="font-display text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{title}</h2>
      </Reveal>
      <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items.map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.q}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-slate-950 transition hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-base"
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
    <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-8">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_140%_at_0%_0%,#13357a_0%,#0a1c3f_55%,#061a3a_100%)] px-6 py-12 text-center shadow-2xl shadow-blue-900/30 sm:px-10 sm:py-14">
          <HeroPattern className="text-white/[0.06]" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-normal text-white sm:text-4xl">{title}</h2>
            {description && <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">{description}</p>}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryCta && (
                <Button asChild className="h-12 rounded-xl bg-blue-600 px-7 text-sm font-bold text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500">
                  <Link to={primaryCta.to}>
                    {primaryCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              {secondaryCta && (
                <Button asChild variant="outline" className="h-12 rounded-xl border-blue-300/40 bg-transparent px-7 text-sm font-bold text-white hover:bg-white/10 hover:text-white">
                  <Link to={secondaryCta.to}>{secondaryCta.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
