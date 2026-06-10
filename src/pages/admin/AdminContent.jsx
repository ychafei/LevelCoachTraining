import React, { useEffect, useState } from 'react';
import { siteContentRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DEFAULT_KEYS = [
  { key: 'hero_headline', label: 'Hero Headline', type: 'text' },
  { key: 'hero_subtext', label: 'Hero Subtext', type: 'textarea' },
  { key: 'cta_headline', label: 'CTA Banner Headline', type: 'text' },
  { key: 'cta_subtext', label: 'CTA Banner Subtext', type: 'textarea' },
];

export default function AdminContent() {
  const { isAdmin } = useCurrentUser();
  const [items, setItems] = useState({});
  const [ids, setIds] = useState({});
  const [saving, setSaving] = useState(false);

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

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-8">SITE CONTENT</h1>
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
