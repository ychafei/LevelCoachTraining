import React, { useEffect, useRef, useState } from 'react';
import { organizationRepo } from '@/api/repo';
import { storage } from '@/lib/storage';
import { sportOptions } from '@/lib/sportsCatalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Building2, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const SPORT_OPTIONS = sportOptions();

function parseSports(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Profile & branding editor — every save routes through orgAdmin.update
// (organizationRepo.update); the logo file uploads to the public org-logos
// bucket first and only the file id is stored on the org document.
export default function OrgProfileTab({ organization, isOrgAdmin, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!organization) return;
    setForm({
      name: organization.name || '',
      type: organization.type || '',
      description: organization.description || '',
      contact_email: organization.contact_email || '',
      contact_phone: organization.contact_phone || '',
      website_url: organization.website_url || '',
      service_area_label: organization.service_area_label || '',
      brand_color: organization.brand_color || '',
      sports: parseSports(organization.primary_sports),
      logo_file_id: organization.logo_file_id || '',
    });
  }, [organization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!organization || !form) return null;

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleSport = (sportKey) => {
    set('sports', form.sports.includes(sportKey)
      ? form.sports.filter((key) => key !== sportKey)
      : [...form.sports, sportKey]);
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      toast.error('Logo must be an image file.');
      return;
    }
    setUploadingLogo(true);
    try {
      const { id } = await storage.uploadFile('org-logos', file);
      const updated = await organizationRepo.update(organization.id, { logo_file_id: id });
      set('logo_file_id', id);
      onSaved?.(updated);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err?.message || 'Could not upload the logo.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!isOrgAdmin) return;
    setSaving(true);
    try {
      const updated = await organizationRepo.update(organization.id, {
        name: form.name,
        type: form.type,
        description: form.description,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        website_url: form.website_url,
        service_area_label: form.service_area_label,
        brand_color: form.brand_color,
        sports: form.sports,
      });
      onSaved?.(updated);
      toast.success('Organization profile saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save the organization profile.');
    } finally {
      setSaving(false);
    }
  };

  const logoUrl = form.logo_file_id ? storage.getFileViewUrl('org-logos', form.logo_file_id) : '';

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Branding</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary"
            style={form.brand_color ? { borderColor: form.brand_color } : undefined}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={`${form.name || 'Organization'} logo`} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              id="org-logo-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => uploadLogo(event.target.files?.[0])}
              disabled={!isOrgAdmin || uploadingLogo}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!isOrgAdmin || uploadingLogo}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingLogo
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />}
              {uploadingLogo ? 'Uploading...' : 'Upload logo'}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">PNG or JPG. Stored in the public org-logos bucket.</p>
          </div>
          <div className="min-w-44">
            <Label htmlFor="org-brand-color" className="text-xs uppercase tracking-wider text-muted-foreground">Brand color</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="org-brand-color"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(form.brand_color) ? form.brand_color : '#0f172a'}
                onChange={(event) => set('brand_color', event.target.value)}
                disabled={!isOrgAdmin}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                aria-label="Pick brand color"
              />
              <Input
                value={form.brand_color}
                onChange={(event) => set('brand_color', event.target.value)}
                placeholder="#1d4ed8"
                disabled={!isOrgAdmin}
                className="bg-secondary border-border"
                aria-label="Brand color hex value"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Organization details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="org-name" className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input id="org-name" value={form.name} onChange={(event) => set('name', event.target.value)} required minLength={2} disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label htmlFor="org-type" className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
            <Input id="org-type" value={form.type} onChange={(event) => set('type', event.target.value)} placeholder="Club, academy, training facility..." disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label htmlFor="org-email" className="text-xs uppercase tracking-wider text-muted-foreground">Contact email</Label>
            <Input id="org-email" type="email" value={form.contact_email} onChange={(event) => set('contact_email', event.target.value)} disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label htmlFor="org-phone" className="text-xs uppercase tracking-wider text-muted-foreground">Contact phone</Label>
            <Input id="org-phone" type="tel" value={form.contact_phone} onChange={(event) => set('contact_phone', event.target.value)} disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label htmlFor="org-website" className="text-xs uppercase tracking-wider text-muted-foreground">Website</Label>
            <Input id="org-website" type="url" value={form.website_url} onChange={(event) => set('website_url', event.target.value)} placeholder="https://" disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div>
            <Label htmlFor="org-area" className="text-xs uppercase tracking-wider text-muted-foreground">Service area</Label>
            <Input id="org-area" value={form.service_area_label} onChange={(event) => set('service_area_label', event.target.value)} placeholder="Metro Detroit, Oakland County..." disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="org-description" className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
            <Textarea id="org-description" value={form.description} onChange={(event) => set('description', event.target.value)} rows={4} disabled={!isOrgAdmin} className="mt-1 bg-secondary border-border" placeholder="What your organization offers athletes and families." />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Primary sports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shown on your public organization page and used in search filters.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Primary sports">
          {SPORT_OPTIONS.map((sport) => {
            const active = form.sports.includes(sport.value);
            return (
              <button
                key={sport.value}
                type="button"
                onClick={() => toggleSport(sport.value)}
                disabled={!isOrgAdmin}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {sport.label}
              </button>
            );
          })}
        </div>
        {form.sports.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No sports selected yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!isOrgAdmin || saving} className="bg-accent text-accent-foreground hover:bg-accent/90 font-display tracking-wider uppercase">
          {saving ? 'Saving...' : 'Save profile'}
        </Button>
        {!isOrgAdmin && (
          <Badge variant="outline" className="text-xs">Owner or admin role required to edit</Badge>
        )}
      </div>
    </form>
  );
}
