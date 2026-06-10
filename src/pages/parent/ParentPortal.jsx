import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { useFamily } from '@/features/parent/useFamily';
import { useMySessions } from '@/features/athlete/useAthletePortalData';
import FamilyOverview from '@/features/parent/FamilyOverview';
import ChildDetail from '@/features/parent/ChildDetail';
import FamilyCalendar from '@/features/parent/FamilyCalendar';
import FamilyPayments from '@/features/parent/FamilyPayments';
import FamilyMessages from '@/features/parent/FamilyMessages';
import ParentDocuments from '@/features/parent/ParentDocuments';
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

  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Parent Portal</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
              {user?.first_name ? `${user.first_name}'s family workspace` : 'Family workspace'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage your athletes, their sessions and training, payments, monitored messages, and signed documents.
            </p>
          </div>
          <ShieldCheck className="h-10 w-10 shrink-0 text-accent" aria-hidden="true" />
        </header>

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
              />
            ) : (
              <FamilyOverview family={family} onViewChild={viewChild} />
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
