import React from 'react';

// Shared LCFC building blocks + the exact LCFC palette (scoped here via
// Tailwind arbitrary values so the global theme is untouched).
//   black     #050505 / #080808 / #0B0B0B / #111111
//   gold      #C9A646 (main) #D4AF37 (hi) #A9822B (deep) #F0D98A (pale)
//   light     #F7F7F5 band / #FFFFFF card / #DDDAD2 border
//   text dark #FFFFFF / #E8E8E8 / #B8B8B8   light #111111 / #2A2A2A / #666666

// Degrades gracefully so pages render before the Appwrite schema exists.
export async function safeLoad(repo, where, sort, fallbackSort) {
  try {
    return await repo.filter(where, sort);
  } catch {
    try {
      return await repo.list(fallbackSort);
    } catch {
      return [];
    }
  }
}

export function GoldButton({ as: As = 'a', className = '', children, ...props }) {
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#C9A646] text-[#050505] font-oswald tracking-widest uppercase text-sm rounded-md shadow-lg shadow-[#C9A646]/20 hover:bg-[#D4AF37] transition-colors ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}

export function LightOutlineButton({ as: As = 'a', className = '', children, ...props }) {
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-[#C9A646] text-[#111111] font-oswald tracking-widest uppercase text-xs rounded-md hover:bg-[#C9A646] hover:text-[#050505] transition-colors ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}

export function DarkOutlineButton({ as: As = 'a', className = '', children, ...props }) {
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-[#C9A646] text-white font-oswald tracking-widest uppercase text-sm rounded-md hover:bg-[#C9A646]/[0.12] hover:text-[#C9A646] transition-colors ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}

export function Card({ id, className = '', children }) {
  return (
    <div
      id={id}
      className={`relative scroll-mt-24 bg-white rounded-2xl border border-[#DDDAD2] shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)] ${className}`}
    >
      <span className="absolute left-7 top-0 h-[3px] w-12 bg-[#C9A646] rounded-full" />
      {children}
    </div>
  );
}

export function CardTitle({ children, sub }) {
  return (
    <div className="mb-5">
      <h2 className="font-oswald text-xl font-bold tracking-[0.12em] uppercase text-[#111111]">{children}</h2>
      {sub && <p className="text-sm text-[#666666] mt-0.5">{sub}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#DDDAD2] bg-[#F7F7F5] py-16 px-4">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-[#C9A646]/10 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-[#C9A646]" />
        </div>
      )}
      <p className="font-oswald tracking-wider uppercase text-sm text-[#666666]">{children}</p>
    </div>
  );
}

// Compact club-style hero used at the top of every LCFC subpage.
export function LcfcHero({ title, subtitle }) {
  return (
    <section className="relative overflow-hidden bg-[#050505]">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 75% 0%, rgba(201,166,70,0.20), transparent 60%), linear-gradient(160deg,#050505 0%,#080808 55%,#111111 100%)' }}
      />
      <div className="absolute -top-20 right-1/4 w-[26rem] h-[26rem] bg-[#C9A646]/10 rounded-full blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: 'repeating-linear-gradient(115deg,#fff 0 1px,transparent 1px 90px)' }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.68),rgba(0,0,0,0.35))' }} />

      <img
        src="/logo-shield.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute right-6 top-1/2 -translate-y-1/2 w-[180px] md:w-[240px] opacity-30 md:opacity-45 drop-shadow-[0_0_50px_rgba(201,166,70,0.35)] hidden sm:block"
      />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-28 md:pt-36 pb-14 md:pb-20">
        <p className="font-oswald text-[11px] tracking-[0.3em] uppercase text-[#B8B8B8] mb-3">LCFC · Les Chèvres</p>
        <h1 className="font-oswald text-4xl md:text-6xl font-bold tracking-tight text-white leading-[0.95]">
          {title}
        </h1>
        {subtitle && <p className="font-oswald text-lg md:text-xl tracking-wide text-[#C9A646] mt-3 max-w-2xl">{subtitle}</p>}
        <div className="h-[3px] w-16 bg-[#C9A646] rounded-full mt-6" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A646]/60 to-transparent" />
    </section>
  );
}

// Page wrapper: dark hero + light off-white content band.
export function LcfcPage({ title, subtitle, children }) {
  return (
    <div className="bg-[#F7F7F5] min-h-screen">
      <LcfcHero title={title} subtitle={subtitle} />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        {children}
      </div>
    </div>
  );
}
