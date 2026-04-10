import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function Settings() {
  const { user, isCoach, refetch } = useCurrentUser();
  const [profile, setProfile] = useState({});
  const [coach, setCoach] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        phone: user.phone || '',
        dob: user.dob || '',
        position: user.position || '',
        skill_level: user.skill_level || '',
        bio: user.bio || '',
        parent_first_name: user.parent_first_name || '',
        parent_last_name: user.parent_last_name || '',
        parent_email: user.parent_email || '',
        parent_phone: user.parent_phone || '',
        parent_relationship: user.parent_relationship || '',
        matching_opted_in: user.matching_opted_in || false,
        matching_age_min: user.matching_age_min || 5,
        matching_age_max: user.matching_age_max || 18,
      });

      if (user.coach_id) {
        base44.entities.Coach.filter({ id: user.coach_id }).then(res => {
          if (res.length > 0) setCoach(res[0]);
        });
      }
    }
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    await base44.auth.updateMe(profile);
    await refetch();
    setSaving(false);
    toast.success('Profile saved');
  };

  const saveCoach = async () => {
    if (!coach) return;
    setSaving(true);
    await base44.entities.Coach.update(coach.id, coach);
    setSaving(false);
    toast.success('Coach profile saved');
  };

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-8">SETTINGS</h1>

        <Tabs defaultValue="profile">
          <TabsList className="bg-card border border-border mb-8">
            <TabsTrigger value="profile" className="font-oswald tracking-wider uppercase text-xs">Profile</TabsTrigger>
            {isCoach && <TabsTrigger value="payment" className="font-oswald tracking-wider uppercase text-xs">Payment</TabsTrigger>}
            {!isCoach && <TabsTrigger value="matching" className="font-oswald tracking-wider uppercase text-xs">Matching</TabsTrigger>}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">Phone</Label>
                <Input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} className="bg-card border-border mt-1" />
              </div>
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">Date of Birth</Label>
                <Input type="date" value={profile.dob} onChange={e => setProfile({...profile, dob: e.target.value})} className="bg-card border-border mt-1" />
              </div>
            </div>
            {!isCoach && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Position</Label>
                  <Select value={profile.position} onValueChange={v => setProfile({...profile, position: v})}>
                    <SelectTrigger className="bg-card border-border mt-1"><SelectValue placeholder="Select position" /></SelectTrigger>
                    <SelectContent>
                      {['Goalkeeper', 'Center Back', 'Fullback', 'Defensive Midfielder', 'Central Midfielder', 'Attacking Midfielder', 'Winger', 'Striker', 'Forward', 'Other'].map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Skill Level</Label>
                  <Select value={profile.skill_level} onValueChange={v => setProfile({...profile, skill_level: v})}>
                    <SelectTrigger className="bg-card border-border mt-1"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      {['Beginner', 'Intermediate', 'Advanced', 'Competitive'].map(l => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Bio</Label>
              <Textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} className="bg-card border-border mt-1" rows={3} />
            </div>

            {!isCoach && (() => {
              const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
              return age !== null && age < 18 ? (
                <div className="border-t border-border pt-6">
                  <h3 className="font-oswald text-sm tracking-widest uppercase text-muted-foreground mb-4">Parent / Guardian Info</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Parent First Name</Label>
                      <Input value={profile.parent_first_name} onChange={e => setProfile({...profile, parent_first_name: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Parent Last Name</Label>
                      <Input value={profile.parent_last_name} onChange={e => setProfile({...profile, parent_last_name: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Parent Email</Label>
                      <Input value={profile.parent_email} onChange={e => setProfile({...profile, parent_email: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Parent Phone</Label>
                      <Input value={profile.parent_phone} onChange={e => setProfile({...profile, parent_phone: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            <Button onClick={saveProfile} disabled={saving} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </TabsContent>

          {/* Payment Tab (coaches only) */}
          {isCoach && coach && (
            <TabsContent value="payment" className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Venmo</Label>
                  <Input value={coach.venmo || ''} onChange={e => setCoach({...coach, venmo: e.target.value})} className="bg-card border-border mt-1" />
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Zelle</Label>
                  <Input value={coach.zelle || ''} onChange={e => setCoach({...coach, zelle: e.target.value})} className="bg-card border-border mt-1" />
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Cash App</Label>
                  <Input value={coach.cashapp || ''} onChange={e => setCoach({...coach, cashapp: e.target.value})} className="bg-card border-border mt-1" />
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">PayPal</Label>
                  <Input value={coach.paypal || ''} onChange={e => setCoach({...coach, paypal: e.target.value})} className="bg-card border-border mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={coach.cash_accepted || false} onCheckedChange={v => setCoach({...coach, cash_accepted: v})} />
                <Label className="text-sm">Accept Cash</Label>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-oswald text-sm tracking-widest uppercase text-muted-foreground mb-4">Coach Profile</h3>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Bio</Label>
                  <Textarea value={coach.bio || ''} onChange={e => setCoach({...coach, bio: e.target.value})} className="bg-card border-border mt-1" rows={3} />
                </div>
                <div className="mt-4">
                  <Label className="font-oswald tracking-wider uppercase text-xs">Quote</Label>
                  <Input value={coach.quote || ''} onChange={e => setCoach({...coach, quote: e.target.value})} className="bg-card border-border mt-1" />
                </div>
                <div className="mt-4">
                  <Label className="font-oswald tracking-wider uppercase text-xs">Training Area</Label>
                  <Input value={coach.training_area || ''} onChange={e => setCoach({...coach, training_area: e.target.value})} className="bg-card border-border mt-1" />
                </div>
              </div>

              <Button onClick={saveCoach} disabled={saving} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
                {saving ? 'Saving...' : 'Save Payment & Profile'}
              </Button>
            </TabsContent>
          )}

          {/* Matching Tab */}
          <TabsContent value="matching" className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
              <div>
                <p className="font-oswald tracking-wider text-sm">Opt In to Player Matching</p>
                <p className="text-xs text-muted-foreground mt-1">Allow other clients to see your first name and player age for match requests.</p>
              </div>
              <Switch checked={profile.matching_opted_in} onCheckedChange={v => setProfile({...profile, matching_opted_in: v})} />
            </div>
            {profile.matching_opted_in && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Min Player Age</Label>
                  <Input type="number" value={profile.matching_age_min} onChange={e => setProfile({...profile, matching_age_min: parseInt(e.target.value) || 0})} className="bg-card border-border mt-1" />
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Max Player Age</Label>
                  <Input type="number" value={profile.matching_age_max} onChange={e => setProfile({...profile, matching_age_max: parseInt(e.target.value) || 0})} className="bg-card border-border mt-1" />
                </div>
              </div>
            )}
            <Button onClick={saveProfile} disabled={saving} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Matching Preferences'}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}