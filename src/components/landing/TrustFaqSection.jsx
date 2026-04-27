import React from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { ShieldCheck, MapPin, CalendarClock, Users, CloudRain, Baby, Wallet, FileText } from 'lucide-react';

// Trust + safety + FAQ section for the public landing page. Plain Q&A in
// shadcn's Accordion to keep it lightweight — no animation work, no new deps.

const FAQ = [
  {
    icon: Baby,
    q: 'What ages do you train?',
    a: 'We train players from roughly age 5 through high-school and college-prep level. Sessions are tailored to the individual — younger players focus on ball mastery and coordination, older players move into game-IQ, speed-of-play, and position-specific work. Adults are welcome too.',
  },
  {
    icon: MapPin,
    q: 'Where do sessions happen?',
    a: 'Training takes place at parks, turf fields, and community spaces in Oakland, Macomb, and Wayne counties. Each coach lists their primary training area on their profile — your coach confirms the exact field after you book.',
  },
  {
    icon: Wallet,
    q: 'How do packages and credits work?',
    a: 'You buy a package (1, 4, 8, or 12 sessions). Each session you have left becomes a credit on your account. You can schedule whenever it fits your week — credits don\'t expire as long as your account is active. Multi-hour sessions get a discount on the per-hour rate.',
  },
  {
    icon: CalendarClock,
    q: '"Schedule Now" vs "Schedule Later" — what\'s the difference?',
    a: 'After you pay, you can book a specific time right away (Schedule Now) or come back to your dashboard whenever you\'re ready (Schedule Later). Either way the credit sits on your account until you use it.',
  },
  {
    icon: FileText,
    q: 'What is your cancellation / reschedule policy?',
    a: 'Cancel or reschedule any session more than 24 hours before the start time and your credit returns automatically. Within 24 hours, the session is non-refundable — exceptions handled case-by-case (illness, injury, weather). Reach out and we\'ll make it right.',
  },
  {
    icon: Users,
    q: 'What do you expect from parents and guardians?',
    a: 'For minors, a parent or guardian creates the account and consents on the child\'s behalf. We\'ll send a one-time consent email when needed. Drop-off / pick-up is on you; coaches stay with the player during the session window. Communication runs through the platform so messages stay in one place.',
  },
  {
    icon: ShieldCheck,
    q: 'Are coaches vetted?',
    a: 'Every coach goes through a written application and review before their profile becomes visible. We collect contact information, training background, and references. Background-check expansion is on our roadmap — if you have specific questions about a coach, ask us before you book.',
  },
  {
    icon: CloudRain,
    q: 'What about weather?',
    a: 'If a session needs to move because of weather, your coach contacts you directly to reschedule, and your credit is preserved. Light rain usually still goes ahead — lightning, thunder, or unsafe field conditions don\'t. The coach makes the safety call.',
  },
];

export default function TrustFaqSection() {
  return (
    <section className="py-24 bg-card/30 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs font-oswald tracking-[0.3em] uppercase text-accent mb-3">Good to know</p>
          <h2 className="font-oswald text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-3">
            QUESTIONS, ANSWERED
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Everything we wish parents and players had asked us before their first session.
          </p>
        </div>

        <Accordion type="single" collapsible className="bg-card border border-border rounded-lg divide-y divide-border">
          {FAQ.map(({ icon: Icon, q, a }, i) => (
            <AccordionItem key={q} value={`faq-${i}`} className="border-b-0 px-5">
              <AccordionTrigger className="py-4 hover:no-underline group">
                <span className="flex items-center gap-3 text-left">
                  <Icon className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="font-oswald tracking-wider text-foreground text-sm sm:text-base group-hover:text-accent transition-colors">
                    {q}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pl-7 pr-2 pb-4">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Still wondering something? <a href="mailto:hello@lctrainings.com" className="text-accent hover:underline">Email us</a> — we read every message.
        </p>
      </div>
    </section>
  );
}
