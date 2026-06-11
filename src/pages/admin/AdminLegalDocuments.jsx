import React, { useEffect, useMemo, useState } from 'react';
import { legalAdminNoteRepo, legalAgreementRepo, legalTemplateRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { generateLegalAgreementPdf, legalPdfUrl } from '@/lib/legal';
import { Download, FileCheck2, FileText, Filter, NotebookPen, RotateCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_FILTERS = ['all', 'athlete', 'guardian', 'coach', 'organization_admin', 'admin'];
const STATUS_FILTERS = ['all', 'signed', 'superseded', 'voided', 'missing_pdf'];

// Display-only labels for stored enum values.
const ROLE_LABELS = {
  all: 'All',
  athlete: 'Athlete',
  guardian: 'Guardian',
  coach: 'Coach',
  organization_admin: 'Organization admin',
  admin: 'Admin',
};

const STATUS_LABELS = {
  all: 'All',
  signed: 'Signed',
  superseded: 'Superseded',
  voided: 'Voided',
  missing_pdf: 'Missing PDF',
};

export default function AdminLegalDocuments() {
  const { user, isAdmin } = useCurrentUser();
  const [templates, setTemplates] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [noteDialog, setNoteDialog] = useState(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [generatingId, setGeneratingId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [templateRows, agreementRows] = await Promise.all([
        legalTemplateRepo.list('-created_date').catch(() => []),
        legalAgreementRepo.list('-created_date').catch(() => []),
      ]);
      setTemplates(templateRows);
      setAgreements(agreementRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agreements.filter((agreement) => {
      if (roleFilter !== 'all' && agreement.signer_role !== roleFilter) return false;
      if (statusFilter === 'missing_pdf' && agreement.pdf_file_id) return false;
      if (statusFilter !== 'all' && statusFilter !== 'missing_pdf' && agreement.status !== statusFilter) return false;
      if (!q) return true;
      return [
        agreement.signer_email,
        agreement.signer_profile_id,
        agreement.typed_legal_name,
        agreement.template_key,
        agreement.template_version,
        agreement.organization_id,
        agreement.coach_id,
        agreement.athlete_id,
        agreement.signature_hash,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [agreements, roleFilter, search, statusFilter]);

  const stats = useMemo(() => ({
    templates: templates.length,
    requiredTemplates: templates.filter((template) => template.required && !template.retired_at).length,
    signed: agreements.filter((agreement) => agreement.status === 'signed').length,
    missingPdf: agreements.filter((agreement) => !agreement.pdf_file_id).length,
  }), [agreements, templates]);

  const ensurePdf = async (agreement) => {
    setGeneratingId(agreement.id);
    try {
      const result = await generateLegalAgreementPdf(agreement.id);
      toast.success(result?.already_exists ? 'PDF already exists' : 'PDF generated');
      await load();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not generate PDF.');
    } finally {
      setGeneratingId('');
    }
  };

  const saveNote = async () => {
    if (!note.trim() || !noteDialog?.id) return;
    setSavingNote(true);
    try {
      await legalAdminNoteRepo.create({
        agreement_id: noteDialog.id,
        admin_profile_id: user?.id || '',
        note: note.trim(),
        visibility: 'admin_only',
      });
      toast.success('Legal note saved');
      setNoteDialog(null);
      setNote('');
    } catch (err) {
      toast.error(err?.message || 'Could not save note.');
    } finally {
      setSavingNote(false);
    }
  };

  if (!isAdmin) {
    return <div className="py-24 text-center text-muted-foreground">Access denied.</div>;
  }

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Legal vault</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.01em] text-foreground">Legal documents</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Audit required templates, signed agreements, generated PDFs, signer metadata, and admin notes.
            </p>
          </div>
          <FileCheck2 className="h-10 w-10 text-accent" />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          <StatTile icon={FileText} label="Templates" value={stats.templates} hint={`${stats.requiredTemplates} required active`} />
          <StatTile icon={FileCheck2} label="Signed" value={stats.signed} hint="current and historical records" />
          <StatTile icon={ShieldAlert} label="Missing PDFs" value={stats.missingPdf} hint="needs generation/retry" />
          <StatTile icon={Filter} label="Filtered" value={filtered.length} hint="visible agreement rows" />
        </div>

        <section className="mt-7 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1">
              <Label className="text-xs font-semibold text-muted-foreground">Search</Label>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 bg-secondary border-border" placeholder="Signer, template, profile, hash..." />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Signer role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="mt-1 w-48 bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_FILTERS.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role] || role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1 w-48 bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status] || status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Templates</h2>
              <p className="mt-1 text-xs text-muted-foreground">Seed with `npm run legal:seed-templates`, then have counsel review before launch.</p>
            </div>
            <div className="divide-y divide-border">
              {templates.length === 0 && !loading && (
                <p className="p-4 text-sm text-muted-foreground">No legal templates found.</p>
              )}
              {templates.map((template) => (
                <div key={template.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{template.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{template.template_key} · {template.role} · v{template.version}</p>
                    </div>
                    <Badge className={template.required ? 'bg-accent/10 text-accent border-accent/20' : 'bg-secondary text-muted-foreground'}>
                      {template.required ? 'Required' : 'Optional'}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">{template.checksum || 'checksum pending'}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Signed agreements</h2>
            </div>
            <div className="divide-y divide-border">
              {loading && <p className="p-4 text-sm text-muted-foreground">Loading legal records...</p>}
              {!loading && filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No matching agreements.</p>}
              {filtered.map((agreement) => (
                <div key={agreement.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{agreement.typed_legal_name || agreement.signer_email || agreement.signer_profile_id}</p>
                        <Badge variant="outline">{ROLE_LABELS[agreement.signer_role] || agreement.signer_role}</Badge>
                        <Badge className={agreement.status === 'signed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-secondary text-muted-foreground'}>
                          {STATUS_LABELS[agreement.status] || agreement.status || 'Signed'}
                        </Badge>
                        {!agreement.pdf_file_id && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Missing PDF</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {agreement.template_key} v{agreement.template_version} · signed {agreement.signed_at ? new Date(agreement.signed_at).toLocaleString() : 'unknown'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {agreement.signer_email || 'no email'} · profile {agreement.signer_profile_id?.slice(0, 8) || 'unknown'} · IP {agreement.ip_address || 'unknown'}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        signature {agreement.signature_hash || 'pending'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {agreement.pdf_file_id ? (
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <a href={legalPdfUrl(agreement.pdf_file_id)} target="_blank" rel="noreferrer">
                            <Download className="mr-1 h-3.5 w-3.5" /> PDF
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={generatingId === agreement.id} onClick={() => ensurePdf(agreement)} className="h-8 text-xs">
                          <RotateCw className="mr-1 h-3.5 w-3.5" /> {generatingId === agreement.id ? 'Generating' : 'Generate'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setNoteDialog(agreement); setNote(''); }} className="h-8 text-xs">
                        <NotebookPen className="mr-1 h-3.5 w-3.5" /> Note
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={!!noteDialog} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Add legal note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {noteDialog?.template_key} · {noteDialog?.typed_legal_name || noteDialog?.signer_email}
          </p>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="bg-secondary border-border" placeholder="Internal admin note..." />
          <Button disabled={savingNote || !note.trim()} onClick={saveNote} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {savingNote ? 'Saving...' : 'Save note'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
