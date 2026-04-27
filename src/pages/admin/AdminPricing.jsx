import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { logAdminAction } from '@/lib/audit';

const empty = { name: '', sessions: '', price: '', badge: '', description: '', includes: [], is_visible: true, display_order: 0 };

export default function AdminPricing() {
  const { user, isAdmin } = useCurrentUser();
  const [packages, setPackages] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [includeInput, setIncludeInput] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => { load(); }, []);
  const load = () => base44.entities.PricingPackage.list('display_order').then(setPackages);

  const save = async () => {
    const data = { ...editing, sessions: Number(editing.sessions), price: Number(editing.price), display_order: Number(editing.display_order) };
    const isUpdate = !!editing.id;
    const previous = isUpdate ? packages.find(p => p.id === editing.id) : null;
    let savedId = editing.id;
    if (isUpdate) {
      await base44.entities.PricingPackage.update(editing.id, data);
    } else {
      const created = await base44.entities.PricingPackage.create(data);
      savedId = created?.id;
    }
    await logAdminAction({
      actor: user,
      action: isUpdate ? 'pricing.update' : 'pricing.create',
      entityType: 'PricingPackage',
      entityId: savedId || '',
      before: isUpdate ? {
        name: previous?.name,
        sessions: previous?.sessions,
        price: previous?.price,
        is_visible: previous?.is_visible,
      } : undefined,
      after: {
        name: data.name,
        sessions: data.sessions,
        price: data.price,
        is_visible: data.is_visible,
      },
    });
    toast.success('Package saved');
    setOpen(false);
    load();
  };

  const remove = async (pkg) => {
    const ok = await confirm({
      title: 'Delete this package?',
      description: `${pkg.name} · ${pkg.sessions} session${pkg.sessions === 1 ? '' : 's'} · $${pkg.price}`,
      consequences: [
        'Permanently removes the pricing package.',
        'Existing SessionCredit records that reference this package by id remain intact.',
        'Booking flow will no longer offer this option to clients.',
      ],
      confirmLabel: 'Delete package',
      cancelLabel: 'Keep package',
      variant: 'destructive',
      requireTyped: 'DELETE',
    });
    if (!ok) return;
    await base44.entities.PricingPackage.delete(pkg.id);
    await logAdminAction({
      actor: user,
      action: 'pricing.delete',
      entityType: 'PricingPackage',
      entityId: pkg.id,
      before: {
        name: pkg.name,
        sessions: pkg.sessions,
        price: pkg.price,
        is_visible: pkg.is_visible,
      },
    });
    toast.success('Package deleted');
    load();
  };

  if (!isAdmin) return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-oswald text-3xl font-bold tracking-tight text-foreground">PRICING PACKAGES</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing({ ...empty, includes: [] }); setIncludeInput(''); }} className="bg-accent text-accent-foreground font-oswald tracking-wider uppercase text-xs hover:bg-accent/90">
                <Plus className="w-4 h-4 mr-2" /> Add Package
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-oswald tracking-wider">{editing?.id ? 'EDIT' : 'ADD'} PACKAGE</DialogTitle></DialogHeader>
              {editing && (
                <div className="space-y-4 mt-4">
                  <div>
                    <Label className="font-oswald tracking-wider uppercase text-xs">Name</Label>
                    <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="bg-secondary border-border mt-1" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Sessions</Label>
                      <Input type="number" value={editing.sessions} onChange={e => setEditing({ ...editing, sessions: e.target.value })} className="bg-secondary border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Price ($)</Label>
                      <Input type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} className="bg-secondary border-border mt-1" />
                    </div>
                    <div>
                      <Label className="font-oswald tracking-wider uppercase text-xs">Order</Label>
                      <Input type="number" value={editing.display_order} onChange={e => setEditing({ ...editing, display_order: e.target.value })} className="bg-secondary border-border mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="font-oswald tracking-wider uppercase text-xs">Badge (e.g. Most Popular)</Label>
                    <Input value={editing.badge || ''} onChange={e => setEditing({ ...editing, badge: e.target.value })} className="bg-secondary border-border mt-1" />
                  </div>
                  <div>
                    <Label className="font-oswald tracking-wider uppercase text-xs">Description</Label>
                    <Textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="bg-secondary border-border mt-1" rows={2} />
                  </div>
                  <div>
                    <Label className="font-oswald tracking-wider uppercase text-xs">Includes</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={includeInput} onChange={e => setIncludeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), includeInput.trim() && (setEditing({ ...editing, includes: [...(editing.includes || []), includeInput.trim()] }), setIncludeInput('')))} placeholder="Add item" className="bg-secondary border-border" />
                      <Button type="button" variant="outline" size="sm" onClick={() => { if (includeInput.trim()) { setEditing({ ...editing, includes: [...(editing.includes || []), includeInput.trim()] }); setIncludeInput(''); } }}>Add</Button>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {editing.includes?.map((item, i) => (
                        <li key={i} className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>• {item}</span>
                          <button className="text-destructive text-xs hover:underline" onClick={() => setEditing({ ...editing, includes: editing.includes.filter((_, idx) => idx !== i) })}>remove</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={editing.is_visible} onCheckedChange={v => setEditing({ ...editing, is_visible: v })} />
                    <Label className="text-sm">Visible on site</Label>
                  </div>
                  <Button onClick={save} className="w-full bg-accent text-accent-foreground font-oswald tracking-wider uppercase hover:bg-accent/90">Save Package</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-oswald tracking-wider text-foreground">{pkg.name}</p>
                  {pkg.badge && <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">{pkg.badge}</Badge>}
                  {!pkg.is_visible && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{pkg.sessions} sessions · ${pkg.price}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...pkg }); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(pkg)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          {packages.length === 0 && <p className="text-center text-muted-foreground py-8">No packages yet.</p>}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}