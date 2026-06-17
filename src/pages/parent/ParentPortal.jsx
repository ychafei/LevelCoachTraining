import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Settings, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { greetingName } from '@/lib/displayName';
import { useFamily } from '@/features/parent/useFamily';
import { useGuardianLegal } from '@/features/parent/useGuardianLegal';
import { useMyReviewedSessionIds, useMySessions } from '@/features/athlete/useAthletePortalData';
import FamilyDashboard from '@/features/parent/FamilyDashboard';
import ChildDetail from '@/features/parent/ChildDetail';
import FamilyCalendar from '@/features/parent/FamilyCalendar';
import FamilyPayments from '@/features/parent/FamilyPayments';
import FamilyMessages from '@/features/parent/FamilyMessages';
import ParentDocuments from '@/features/parent/ParentDocuments';
import PostSessionReviewPrompt from '@/features/athlete/PostSessionReviewPrompt';
import { SkeletonCard } from '@/features/athlete/portalShared';

const TABS = [
  { value: 'family', label: 'Family' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'payments', label: 'Payments' },
  { value: 'messages', label: 'Messages' },
  { value: 'documents', label: 'Documents' },
];

export default function ParentPortal() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab = TABS.some((t) => t.value === rawTab) ? rawTab : 'family';
  const childId = searchParams.get('child') || '';

  const family = useFamily(user);
  const sessionsData = useMySessions(user, family.childIds);
  const reviewsData = useMyReviewedSessionIds(user);
  const guardianLegal = useGuardianLegal(user, family.childIds);

  const setParams = (updates) => {
    setSearchParams((params) => {
      const copy = new URLSearchParams(params);
      for (const [key, value] of Object.entries(updates)) {
        if (value) copy.set(key, value);
        else copy.delete(key);
      }
      return copy;
    });
  };

  const goTab = (next) => setParams({ tab: next, child: '' });
  const viewChild = (child) => setParams({ tab: 'family', child: child.id });

  const selectedChild = family.children.find((child) => child.id === childId) || null;
  const name = greetingName(user);

  return (
    <div className="pb-12">
      {/* Gradient family header */}
      <header className="relative overflow-hidden border-b border-border bg-[linear-gradient(120deg,#0b2350_0%,#13357a_48%,#2563eb_100%)] text-white">
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Family command center
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.01em] sm:text-4xl">
                {`${name}'s family`}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                Everything in one safe place — your athletes&apos; sessions and training, payments,
                monitored messages, emergency info, and signed documents.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Child switcher — jumps straight into an athlete */}
              {family.children.length > 0 && (
                <div className="w-44">
                  <label htmlFor="child-switcher" className="sr-only">Jump to athlete</label>
                  <Select
                    value={selectedChild ? selectedChild.id : ''}
                    onValueChange={(value) => {
                      const child = family.children.find((c) => c.id === value);
                      if (child) viewChild(child);
                    }}
                  >
                    <SelectTrigger
                      id="child-switcher"
                      className="h-9 border-white/25 bg-white/10 text-sm text-white backdrop-blur placeholder:text-blue-100 focus:ring-white/40"
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        <SelectValue placeholder="Jump to athlete" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {family.children.map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          {[child.first_name, child.last_name].filter(Boolean).join(' ') || 'Athlete'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
              >
                <Link to="/parent/settings">
                  <Settings className="mr-1.5 h-4 w-4" aria-hidden="true" /> Settings
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <PostSessionReviewPrompt
          sessions={sessionsData.sessions}
          coachesById={sessionsData.coachesById}
          reviewedSessionIds={reviewsData.reviewedSessionIds}
          loading={sessionsData.loading || sessionsData.coachesLoading || reviewsData.loading}
          onChanged={() => {
            reviewsData.refresh();
            sessionsData.refresh();
          }}
        />

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

          <TabsContent value="family" className="mt-5 focus-visible:outline-none">
            {childId && family.loading ? (
              <SkeletonCard />
            ) : selectedChild ? (
              <ChildDetail
                user={user}
                child={selectedChild}
                link={family.linkByAthleteId[selectedChild.id] || null}
                onBack={() => setParams({ child: '' })}
                onFamilyChanged={family.refresh}
                reviewedSessionIds={reviewsData.reviewedSessionIds}
                onReviewChanged={reviewsData.refresh}
              />
            ) : (
              <FamilyDashboard
                family={family}
                sessionsData={sessionsData}
                user={user}
                guardianLegal={guardianLegal}
                onViewChild={viewChild}
                onGoTab={goTab}
              />
            )}
          </TabsContent>

          <TabsContent value="calendar" className="mt-5 focus-visible:outline-none">
            <FamilyCalendar
              sessionsData={sessionsData}
              childNamesById={family.childNamesById}
              viewerName={user?.first_name ? `${user.first_name} (you)` : 'You'}
            />
          </TabsContent>

          <TabsContent value="payments" className="mt-5 focus-visible:outline-none">
            <FamilyPayments user={user} />
          </TabsContent>

          <TabsContent value="messages" className="mt-5 focus-visible:outline-none">
            <FamilyMessages user={user} />
          </TabsContent>

          <TabsContent value="documents" className="mt-5 focus-visible:outline-none">
            <ParentDocuments user={user} family={family} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
