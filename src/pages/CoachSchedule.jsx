import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import WeeklyAvailabilityEditor from '@/components/coach/WeeklyAvailabilityEditor';

export default function CoachSchedule() {
  const { user, isCoach, isAdmin } = useCurrentUser();
  const [blocks, setBlocks] = useState([]);
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newBlock, setNewBlock] = useState({ label: '', start_date: '', end_date: '', block_all_day: true, blocked_start_time: '', blocked_end_time: '' });
  const [availability, setAvailability] = useState({});
  const [savingAvail, setSavingAvail] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!user.coach_id) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const coaches = await base44.entities.Coach.filter({ id: user.coach_id });
      if (coaches.length > 0) {
        setCoach(coaches[0]);
        setAvailability(coaches[0].availability || {});
      }
      const b = await base44.entities.CoachBlock.filter({ coach_id: user.coach_id, is_active: true }, '-start_date');
      setBlocks(b);
      setLoading(false);
    };
    load();
  }, [user]);

  const addBlock = async () => {
    if (!newBlock.start_date || !newBlock.end_date) {
      toast.error('Please select start and end dates.');
      return;
    }
    const block = { ...newBlock, coach_id: user.coach_id, is_active: true };
    await base44.entities.CoachBlock.create(block);
    toast.success('Block added');
    const b = await base44.entities.CoachBlock.filter({ coach_id: user.coach_id, is_active: true }, '-start_date');
    setBlocks(b);
    setNewBlock({ label: '', start_date: '', end_date: '', block_all_day: true, blocked_start_time: '', blocked_end_time: '' });
  };

  const saveAvailability = async () => {
    setSavingAvail(true);
    await base44.entities.Coach.update(coach.id, { availability });
    toast.success('Availability saved');
    setSavingAvail(false);
  };

  const removeBlock = async (id) => {
    await base44.entities.CoachBlock.update(id, { is_active: false });
    setBlocks(prev => prev.filter(b => b.id !== id));
    toast.success('Block removed');
  };

  if (loading) {
    return <div className="py-24 text-center"><div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin mx-auto" /></div>;
  }

  if (!isCoach && !isAdmin) {
    return (
      <div className="py-24 text-center space-y-2">
        <p className="text-foreground font-oswald text-xl uppercase tracking-wider">Access Denied</p>
        <p className="text-muted-foreground text-sm">This page is for coaches only.</p>
      </div>
    );
  }

  if (!user?.coach_id) {
    return (
      <div className="py-24 text-center space-y-2">
        <p className="text-foreground font-oswald text-xl uppercase tracking-wider">Coach Profile Not Linked</p>
        <p className="text-muted-foreground text-sm">Your user account is not linked to a Coach profile yet.<br />Please ask an admin to set your <strong>coach_id</strong> in the Users panel.</p>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground mb-2">SCHEDULE MANAGER</h1>
        <p className="text-muted-foreground mb-10">Manage your availability and block off dates.</p>

        {/* Weekly Availability */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="font-oswald text-lg tracking-widest uppercase text-foreground mb-1">
            <Clock className="inline w-4 h-4 mr-2" />Weekly Availability
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Set which days and hours you're available for bookings.</p>
          <WeeklyAvailabilityEditor availability={availability} onChange={setAvailability} />
          <Button onClick={saveAvailability} disabled={savingAvail} className="mt-4 bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
            {savingAvail ? 'Saving...' : 'Save Availability'}
          </Button>
        </div>

        {/* Add Block */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="font-oswald text-lg tracking-widest uppercase text-foreground mb-4">
            <Plus className="inline w-4 h-4 mr-2" />Add Block
          </h2>
          <div className="space-y-4">
            <div>
              <Label className="font-oswald tracking-wider uppercase text-xs">Label</Label>
              <Input placeholder="e.g. Vacation, Personal Day" value={newBlock.label} onChange={e => setNewBlock({...newBlock, label: e.target.value})} className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">Start Date</Label>
                <Input type="date" value={newBlock.start_date} onChange={e => setNewBlock({...newBlock, start_date: e.target.value})} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="font-oswald tracking-wider uppercase text-xs">End Date</Label>
                <Input type="date" value={newBlock.end_date} onChange={e => setNewBlock({...newBlock, end_date: e.target.value})} className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={newBlock.block_all_day} onCheckedChange={v => setNewBlock({...newBlock, block_all_day: v})} />
              <Label className="text-sm">Block All Day</Label>
            </div>
            {!newBlock.block_all_day && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">Start Time</Label>
                  <Input type="time" value={newBlock.blocked_start_time} onChange={e => setNewBlock({...newBlock, blocked_start_time: e.target.value})} className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="font-oswald tracking-wider uppercase text-xs">End Time</Label>
                  <Input type="time" value={newBlock.blocked_end_time} onChange={e => setNewBlock({...newBlock, blocked_end_time: e.target.value})} className="bg-secondary border-border mt-1" />
                </div>
              </div>
            )}
            <Button onClick={addBlock} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">
              Add Block
            </Button>
          </div>
        </div>

        {/* Current Blocks */}
        <h2 className="font-oswald text-lg tracking-widest uppercase text-foreground mb-4">
          <Calendar className="inline w-4 h-4 mr-2" />Current Blocks
        </h2>
        {blocks.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
            No blocks set. Your calendar is fully open.
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map(block => (
              <div key={block.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-oswald tracking-wider text-sm text-foreground">{block.label || 'Blocked'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(block.start_date), 'MMM d')} — {format(new Date(block.end_date), 'MMM d, yyyy')}
                    {!block.block_all_day && ` · ${block.blocked_start_time} – ${block.blocked_end_time}`}
                    {block.block_all_day && ' · All Day'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeBlock(block.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}