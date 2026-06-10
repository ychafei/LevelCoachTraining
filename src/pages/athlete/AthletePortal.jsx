import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Baby, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { useMyAthlete } from '@/features/athlete/useMyAthlete';
import {
  useMyCredits,
  useMyReviewedSessionIds,
  useMySessions,
  useMyTraining,
} from '@/features/athlete/useAthletePortalData';
import { positionLabelFor, sportDisplayName, sportIconFor } from '@/features/athlete/sportMeta';
import AthleteOverview from '@/features/athlete/AthleteOverview';
import AthleteTraining from '@/features/athlete/AthleteTraining';
import AthleteWellness from '@/features/athlete/AthleteWellness';
import AthleteDocuments from '@/features/athlete/AthleteDocuments';
import SessionsPanel from '@/features/athlete/SessionsPanel';
import { SectionCard } from '@/features/athlete/portalShared';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'training', label: 'My Training' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'documents', label: 'Documents' },
];

function SportIdentity({ athlete, user }) {
  if (athlete.loading) {
    return <div className="h-7 w-48 animate-pulse rounded-full bg-secondary/60" aria-hidden="true" />;
  }
  if (athlete.sports.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Your sports">
      {athlete.sports.map((sport) => {
        const Icon = sportIconFor(sport);
        const position = positionLabelFor(sport, user?.position);
        return (
          <Badge
            key={sport}
            variant="outline"
            className="gap-1.5 border-accent/40 bg-accent/5 px-3 py-1 text-xs font-semibold text-foreground"
          >
            <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {sportDisplayName(sport)}
            {position && <span className="text-muted-foreground">· {position}</span>}
          </Badge>
        );
      })}
      {athlete.athleteProfile?.skill_level && (
        <Badge variant="outline" className="px-3 py-1 text-xs text-muted-foreground">
          {athlete.athleteProfile.skill_level}
        </Badge>
      )}
    </div>
  );
}

export default function AthletePortal() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.value === rawTab) ? rawTab : 'overview';

  const goTab = (next) => {
    setSearchParams((params) => {
      const copy = new URLSearchParams(params);
      copy.set('tab', next);
      return copy;
    });
  };

  const athlete = useMyAthlete(user);
  const sessionsData = useMySessions(user, athlete.athleteIds);
  const creditsData = useMyCredits(user);
  const trainingData = useMyTraining(user, athlete.athleteIds);
  const { reviewedSessionIds } = useMyReviewedSessionIds(user);
  const legalStatus = useLegalPacketStatus({ user, signerRole: 'athlete' });

  const firstSport = athlete.sports[0] || '';

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Athlete Portal</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
            {user?.first_name ? `Welcome, ${user.first_name}` : 'Your training dashboard'}
          </h1>
          <div className="mt-3">
            <SportIdentity athlete={athlete} user={user} />
          </div>
        </header>

        {user?.is_minor === true && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4" role="note">
            <Baby className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-foreground">Heads up:</span> because you&apos;re under 18, booking and
              payments run through your parent or guardian. You can still see your sessions, do your homework, check in,
              and track your progress right here.
            </p>
          </div>
        )}

        <Tabs value={tab} onValueChange={goTab} className="mt-6">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max gap-1 bg-secondary/40 p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3 py-1.5 text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5 focus-visible:outline-none">
            <AthleteOverview
              user={user}
              sessionsData={sessionsData}
              creditsData={creditsData}
              trainingData={trainingData}
              reviewedSessionIds={reviewedSessionIds}
              legalStatus={legalStatus}
              goTab={goTab}
            />
          </TabsContent>

          <TabsContent value="training" className="mt-5 focus-visible:outline-none">
            <AthleteTraining
              trainingData={trainingData}
              fallbackSport={firstSport}
              coachesById={sessionsData.coachesById}
            />
          </TabsContent>

          <TabsContent value="sessions" className="mt-5 focus-visible:outline-none">
            <SectionCard
              title="Your sessions"
              icon={CalendarDays}
              description="Cancel at least 24 hours ahead to get your credit back automatically. Later cancellations forfeit the credit unless the coach cancels."
            >
              <SessionsPanel
                sessions={sessionsData.sessions}
                coachesById={sessionsData.coachesById}
                loading={sessionsData.loading}
                onChanged={sessionsData.refresh}
                reviewedSessionIds={reviewedSessionIds}
                canManage={user?.is_minor !== true}
              />
            </SectionCard>
          </TabsContent>

          <TabsContent value="wellness" className="mt-5 focus-visible:outline-none">
            <AthleteWellness
              user={user}
              athleteProfile={athlete.athleteProfile}
              athleteIds={athlete.athleteIds}
              sessions={sessionsData.sessions}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-5 focus-visible:outline-none">
            <AthleteDocuments user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
