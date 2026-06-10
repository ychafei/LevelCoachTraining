import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Briefcase, FileText } from 'lucide-react';
import { ApplicationForm } from '@/components/apply/ApplicationForm';

const PATHS = [
  {
    to: '/apply/private-training-coach',
    icon: Briefcase,
    title: 'Create Coach Account',
    desc: 'Set up a free private coach profile.',
  },
  {
    to: '/apply/training-organization',
    icon: Building2,
    title: 'Create Organization Account',
    desc: 'Set up a free training organization profile.',
  },
];

export default function Apply() {
  return (
    <div>
      <section className="py-16 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Build on LevelCoach
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Pick the path that fits your coaching business. Coaches and organizations can start with a free LevelCoach setup.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PATHS.map(({ to, icon: Icon, title, desc }) => (
              <Link
                key={to}
                to={to}
                className="group bg-card border border-border rounded-lg p-6 hover:border-accent/50 hover:bg-card/80 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-accent" />
                </div>
                <h3 className="font-display text-lg tracking-wider text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary/30 border-b border-border py-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-accent" />
            <span className="text-xs font-display tracking-widest uppercase text-accent">General Application</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl tracking-tight text-foreground mb-2">
            NOT SURE WHICH PATH?
          </h2>
          <p className="text-sm text-muted-foreground">
            Use the form below to introduce yourself. We'll route you to the right setup path.
          </p>
        </div>
      </section>

      <ApplicationForm
        title="General Application"
        subtitle="Tell us who you are and what you want to build with LevelCoach. Every application is reviewed by a person; approvals arrive by email with onboarding instructions."
        promptLabel="What's on your mind? *"
        promptPlaceholder="Coaching, organization setup, partnerships, integrations — let us know."
      />
    </div>
  );
}
