import React from 'react';
import { LevelCoachWordmarkPlate } from '@/components/public/LevelCoachLogo';

// Blue gradient brand panel shown on the right of the auth pages.
// Headline, copy, an optional decorative preview card and three benefit
// items are all passed in so Sign In and Create Account can share the shell
// while keeping their own messaging.
export default function AuthBrandPanel({ headline, copy, preview, benefits }) {
  return (
    <div className="relative h-full overflow-hidden rounded-[20px] bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 px-8 py-10 text-white xl:px-12">
      {/* soft decorative glows */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
      {/* dotted accent */}
      <div
        className="pointer-events-none absolute right-10 top-28 h-16 w-16 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '10px 10px',
        }}
      />

      <div className="relative flex h-full flex-col">
        {/* logo */}
        <LevelCoachWordmarkPlate className="self-start" imageClassName="h-9 w-auto object-contain" />

        <div className="mt-10">
          <h2 className="font-display text-3xl font-bold tracking-tight xl:text-4xl">{headline}</h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-100">{copy}</p>
        </div>

        {/* decorative preview card */}
        <div className="mt-8">{preview}</div>

        {/* benefits */}
        <div className="mt-auto grid grid-cols-1 gap-6 pt-10 sm:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div key={title}>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                <Icon className="h-5 w-5 text-white" />
              </span>
              <h3 className="mt-3 text-sm font-bold leading-snug">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-blue-100">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
