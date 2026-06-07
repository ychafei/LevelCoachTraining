import React, { useEffect, useState } from 'react';
import { siteContentRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { DEMO_COACH_PROFILE_COUNT } from '@/lib/demoCoachProfiles';
import {
  DEMO_COACH_PROFILES_ENABLED_KEY,
  loadDemoCoachProfilesEnabled,
  saveDemoCoachProfilesEnabled,
} from '@/lib/demoCoachSettings';

const DEFAULT_KEYS = [
  { key: 'hero_headline', label: 'Hero Headline', type: 'text' },
  { key: 'hero_subtext', label: 'Hero Subtext', type: 'textarea' },
  { key: 'cta_headline', label: 'CTA Banner Headline', type: 'text' },
  { key: 'cta_subtext', label: 'CTA Banner Subtext', type: 'textarea' },
];

export default function AdminContent() {
  const { isAdmin, isSuperAdmin } = useCurrentUser();
  const [items, setItems] = useState({});
  const [ids, setIds] = useState({});
  const [saving, setSaving] = useState(false);
  const [demoProfilesEnabled, setDemoProfilesEnabled] = useState(true);
  const [savingDemoProfiles, setSavingDemoProfiles] = useState(false);

  useEffect(() => {
    siteContentRepo.list()
      .then(data => {
        const vals = {};
        const idMap = {};
        data.forEach(d => { vals[d.key] = d.value; idMap[d.key] = d.id; });
        setItems(vals);
        setIds(idMap);
      })
      .catch((err) => {
        console.warn('Site content is unavailable; using local/default content settings.', err);
      });
    loadDemoCoachProfilesEnabled().then(setDemoProfilesEnabled);
  }, []);

  const save = async () => {
    setSaving(true);
    for (const { key } of DEFAULT_KEYS) {
      if (ids[key]) {
        await siteContentRepo.update(ids[key], { value: items[key] || '' });
      } else {
        const created = await siteContentRepo.create({ key, value: items[key] || '', content_type: 'text' });
        setIds(prev => ({ ...prev, [key]: created.id }));
      }
    }
    setSaving(false);
    toast.success('Content saved');
  };

  const toggleDemoProfiles = async (checked) => {
    setDemoProfilesEnabled(checked);
    setSavingDemoProfiles(true);
    try {
      const saved = await saveDemoCoachProfilesEnabled(checked);
      if (saved?.id) {
        setIds(prev => ({ ...prev, [DEMO_COACH_PROFILES_ENABLED_KEY]: saved.id }));
        setItems(prev => ({ ...prev, [DEMO_COACH_PROFILES_ENABLED_KEY]: checked ? 'true' : 'false' }));
      }
      toast.success(checked ? 'Demo coach profiles enabled' : 'Demo coach profiles disabled');
    } catch (err) {
      console.error('Could not save demo profile setting', err);
      toast.error('Could not save demo profile setting. Local preview was updated, but Appwrite did not persist it.');
    } finally {
      setSavingDemoProfiles(false);
    }
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-8">SITE CONTENT</h1>
        {isSuperAdmin && (
          <div className="bg-card border border-border rounded-lg p-6 mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-sm font-bold tracking-widest uppercase text-accent">Master Admin</p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mt-1">Demo Marketplace Profiles</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  Show {DEMO_COACH_PROFILE_COUNT} fake sample coach profiles while the marketplace is being prepared. Turn this off before launch so only real approved coaches appear publicly.
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                  Setting key: <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">{DEMO_COACH_PROFILES_ENABLED_KEY}</code>
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
                <span className="text-xs font-display tracking-widest uppercase text-muted-foreground">
                  {demoProfilesEnabled ? 'On' : 'Off'}
                </span>
                <Switch
                  checked={demoProfilesEnabled}
                  onCheckedChange={toggleDemoProfiles}
                  disabled={savingDemoProfiles}
                  aria-label="Toggle demo coach profiles"
                />
              </div>
            </div>
          </div>
        )}
        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          {DEFAULT_KEYS.map(({ key, label, type }) => (
            <div key={key}>
              <Label className="font-display tracking-wider uppercase text-xs text-muted-foreground">{label}</Label>
              {type === 'textarea' ? (
                <Textarea
                  value={items[key] || ''}
                  onChange={e => setItems({ ...items, [key]: e.target.value })}
                  className="bg-secondary border-border mt-1"
                  rows={3}
                />
              ) : (
                <Input
                  value={items[key] || ''}
                  onChange={e => setItems({ ...items, [key]: e.target.value })}
                  className="bg-secondary border-border mt-1"
                />
              )}
            </div>
          ))}
          <Button onClick={save} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
            {saving ? 'Saving…' : 'Save All'}
          </Button>
        </div>
      </div>
    </div>
  );
}
