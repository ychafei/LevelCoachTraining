import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { CANCEL_POLICY_COPY } from '@/lib/policies';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { useMyAthlete } from '@/features/athlete/useMyAthlete';
import {
  useMyCredits,
  useMyReviewedSessionIds,
  useMySessions,
  useMyTraining,
} from '@/features/athlete/useAthletePortalData';
import AthletePortalHeader from '@/features/athlete/AthletePortalHeader';
import AthleteOverview from '@/features/athlete/AthleteOverview';
import AthleteTraining from '@/features/athlete/AthleteTraining';
import AthleteWellness from '@/features/athlete/AthleteWellness';
import AthleteDocuments from '@/features/athlete/AthleteDocuments';
import PostSessionReviewPrompt from '@/features/athlete/PostSessionReviewPrompt';
import SessionsPanel from '@/features/athlete/SessionsPanel';
import { Reveal, SectionCard } from '@/features/athlete/portalShared';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'training', label: 'My Training' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'documents', label: 'Documents' },
];

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
  const reviewsData = useMyReviewedSessionIds(user);
  const { reviewedSessionIds } = reviewsData;
  const legalStatus = useLegalPacketStatus({ user, signerRole: 'athlete' });

  const firstSport = athlete.sports[0] || '';

  return (
    <div className="min-h-screen bg-background py-8 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AthletePortalHeader
          user={user}
          athlete={athlete}
          sessionsData={sessionsData}
          creditsData={creditsData}
          trainingData={trainingData}
        />

        <PostSessionReviewPrompt
          sessions={sessionsData.sessions}
          coachesById={sessionsData.coachesById}
          reviewedSessionIds={reviewedSessionIds}
          loading={sessionsData.loading || sessionsData.coachesLoading || reviewsData.loading}
          onChanged={() => {
            reviewsData.refresh();
            sessionsData.refresh();
          }}
        />

        <Tabs value={tab} onValueChange={goTab} className="mt-8">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-max gap-1 bg-secondary/40 p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3.5 py-1.5 text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5 focus-visible:outline-none">
            <Reveal>
              <AthleteOverview
                user={user}
                sessionsData={sessionsData}
                creditsData={creditsData}
                trainingData={trainingData}
                reviewedSessionIds={reviewedSessionIds}
                legalStatus={legalStatus}
                goTab={goTab}
              />
            </Reveal>
          </TabsContent>

          <TabsContent value="training" className="mt-5 focus-visible:outline-none">
            <Reveal>
              <AthleteTraining
                trainingData={trainingData}
                fallbackSport={firstSport}
                coachesById={sessionsData.coachesById}
              />
            </Reveal>
          </TabsContent>

          <TabsContent value="sessions" className="mt-5 focus-visible:outline-none">
            <Reveal>
              <SectionCard
                title="Your sessions"
                icon={CalendarDays}
                description={CANCEL_POLICY_COPY}
              >
                <SessionsPanel
                  sessions={sessionsData.sessions}
                  coachesById={sessionsData.coachesById}
                  loading={sessionsData.loading}
                  onChanged={sessionsData.refresh}
                  reviewedSessionIds={reviewedSessionIds}
                  onReviewChanged={reviewsData.refresh}
                  canManage={user?.is_minor !== true}
                />
              </SectionCard>
            </Reveal>
          </TabsContent>

          <TabsContent value="wellness" className="mt-5 focus-visible:outline-none">
            <Reveal>
              <AthleteWellness
                user={user}
                athleteProfile={athlete.athleteProfile}
                athleteIds={athlete.athleteIds}
                sessions={sessionsData.sessions}
              />
            </Reveal>
          </TabsContent>

          <TabsContent value="documents" className="mt-5 focus-visible:outline-none">
            <Reveal>
              <AthleteDocuments user={user} />
            </Reveal>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
