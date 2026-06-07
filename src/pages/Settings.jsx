import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/lib/auth';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user, isCoach, refetch } = useCurrentUser();
  const [profile, setProfile] = useState({});
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
        matching_age_group: user.matching_age_group || '',
      });
    }
  }, [user]);

  const saveProfile = async () => {
    setSaving(true);
    await auth.updateCurrentUser(profile);
    await refetch();
    setSaving(false);
    toast.success('Profile saved');
  };

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-8">SETTINGS</h1>

        {isCoach && (
          <Link
            to="/coach/profile"
            className="block mb-6 bg-card border border-accent/30 rounded-lg p-4 hover:border-accent/60 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <UserCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-display tracking-wider text-foreground text-sm uppercase">Coaching Profile</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bio, quote, training area, payment handles, and email verification live in your coach portal.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-accent flex-shrink-0" />
            </div>
          </Link>
        )}

        <Tabs defaultValue="profile">
          <TabsList className="bg-card border border-border mb-8">
            <TabsTrigger value="profile" className="font-display tracking-wider uppercase text-xs">Profile</TabsTrigger>
            {!isCoach && <TabsTrigger value="matching" className="font-display tracking-wider uppercase text-xs">Matching</TabsTrigger>}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="font-display tracking-wider uppercase text-xs">Phone</Label>
                <Input value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} className="bg-card border-border mt-1" />
              </div>
              <div>
                <Label className="font-display tracking-wider uppercase text-xs">Date of Birth</Label>
                <Input type="date" value={profile.dob} onChange={e => setProfile({...profile, dob: e.target.value})} className="bg-card border-border mt-1" />
              </div>
            </div>
            {!isCoach && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-display tracking-wider uppercase text-xs">Position</Label>
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
                  <Label className="font-display tracking-wider uppercase text-xs">Skill Level</Label>
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
              <Label className="font-display tracking-wider uppercase text-xs">Bio</Label>
              <Textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} className="bg-card border-border mt-1" rows={3} />
            </div>

            {!isCoach && (() => {
              const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
              return age !== null && age < 18 ? (
                <div className="border-t border-border pt-6">
                  <h3 className="font-display text-sm tracking-widest uppercase text-muted-foreground mb-4">Parent / Guardian Info</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Parent First Name</Label>
                      <Input value={profile.parent_first_name} onChange={e => setProfile({...profile, parent_first_name: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Parent Last Name</Label>
                      <Input value={profile.parent_last_name} onChange={e => setProfile({...profile, parent_last_name: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Parent Email</Label>
                      <Input value={profile.parent_email} onChange={e => setProfile({...profile, parent_email: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-display tracking-wider uppercase text-xs">Parent Phone</Label>
                      <Input value={profile.parent_phone} onChange={e => setProfile({...profile, parent_phone: e.target.value})} className="bg-card border-border mt-1" />
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            <Button onClick={saveProfile} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </TabsContent>

          {/* Matching Tab */}
          <TabsContent value="matching" className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-lg">
              <div>
                <p className="font-display tracking-wider text-sm">Opt In to Player Matching</p>
                <p className="text-xs text-muted-foreground mt-1">Allow other clients to see your first name and age for match requests.</p>
              </div>
              <Switch checked={profile.matching_opted_in} onCheckedChange={v => setProfile({...profile, matching_opted_in: v})} />
            </div>
            {profile.matching_opted_in && (
              <div className="space-y-3">
                <Label className="font-display tracking-wider uppercase text-xs">Preferred Age Group</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Ages 5–8', value: '5-8' },
                    { label: 'Ages 9–12', value: '9-12' },
                    { label: 'Ages 13+', value: '13+' },
                  ].map(group => (
                    <button
                      key={group.value}
                      onClick={() => setProfile({...profile, matching_age_group: group.value})}
                      className={`p-3 rounded-lg border text-sm font-display tracking-wider uppercase text-center transition-all ${
                        profile.matching_age_group === group.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-muted-foreground hover:border-accent/30'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">You'll appear in matching for players in your selected age group.</p>
              </div>
            )}
            <Button onClick={saveProfile} disabled={saving} className="bg-accent text-accent-foreground font-display tracking-wider uppercase hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Matching Preferences'}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
