import React, { useEffect, useState } from 'react';
import { Quote } from 'lucide-react';
import { loadLcfcSettings, toLines } from '@/lib/lcfcSettings';
import { LcfcPage, Card, CardTitle } from '@/components/lcfc/LcfcKit';

export default function LcfcLearnMore() {
  const [s, setS] = useState(null);
  useEffect(() => { loadLcfcSettings().then(setS); }, []);

  const aboutBody = s?.about_body
    || 'LCFC is the competitive men’s team division of LC Training. LC Training develops players through private and small-group training, while LCFC gives committed players a platform to compete in a serious team environment.';
  const quoteLines = toLines(
    s?.quote_text || 'LC Training develops the player.\nLCFC gives the player a platform to compete.',
  );

  return (
    <LcfcPage title="Learn More" subtitle="One club, two connected identities.">
      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <Card className="p-8 lg:p-10 flex flex-col">
          <CardTitle>About LCFC</CardTitle>
          <p className="text-[#2A2A2A] leading-relaxed">{aboutBody}</p>
        </Card>

        <div className="relative rounded-2xl overflow-hidden bg-[#050505] p-10 flex flex-col justify-center min-h-[240px]">
          <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(circle at 85% 15%, rgba(201,166,70,0.18), transparent 55%)' }} />
          <div className="absolute top-5 left-5 right-5 h-px bg-[#C9A646]/40" />
          <div className="absolute bottom-5 left-5 right-5 h-px bg-[#C9A646]/40" />
          <Quote className="w-12 h-12 text-[#C9A646] mb-4" />
          {quoteLines.map((line, i) => (
            <p key={i} className="font-oswald text-2xl md:text-[28px] leading-snug tracking-wide text-[#C9A646]">{line}</p>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mt-6">
        <Card className="p-8">
          <CardTitle sub="Development">LC Training</CardTitle>
          <p className="text-[#2A2A2A] leading-relaxed">
            LC Training is for development — private and small-group sessions, coaching,
            and structured programs focused on building the individual player.
          </p>
        </Card>
        <Card className="p-8">
          <CardTitle sub="Competition">LCFC</CardTitle>
          <p className="text-[#2A2A2A] leading-relaxed">
            LCFC is for competition — a serious men's team environment for committed
            players who want to test their development in a real club setting.
          </p>
        </Card>
      </div>
    </LcfcPage>
  );
}
