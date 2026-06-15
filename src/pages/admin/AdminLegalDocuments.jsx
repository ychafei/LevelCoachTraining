import React, { useEffect, useMemo, useState } from 'react';
import { legalAdminNoteRepo, legalAgreementRepo, legalTemplateRepo } from '@/api/repo';
import useCurrentUser from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { generateLegalAgreementPdf, legalPdfUrl } from '@/lib/legal';
import {
  Archive,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  NotebookPen,
  Pencil,
  Plus,
  RotateCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_FILTERS = ['all', 'athlete', 'guardian', 'coach', 'organization_admin', 'admin'];
const TEMPLATE_ROLES = ['athlete', 'guardian', 'coach', 'organization', 'admin', 'platform'];
const STATUS_FILTERS = ['all', 'signed', 'superseded', 'voided', 'missing_pdf'];

const ROLE_LABELS = {
  all: 'All',
  athlete: 'Athlete',
  guardian: 'Guardian',
  coach: 'Coach',
  organization: 'Organization',
  organization_admin: 'Organization admin',
  admin: 'Admin',
  platform: 'Platform',
};

const STATUS_LABELS = {
  all: 'All',
  signed: 'Signed',
  superseded: 'Superseded',
  voided: 'Voided',
  missing_pdf: 'Missing PDF',
};

const emptyTemplateForm = {
  template_key: '',
  role: 'athlete',
  version: '1.0',
  title: '',
  body: '',
  required: true,
  effective_at: '',
  jurisdiction: 'Michigan, United States',
};

function templateActive(template) {
  if (!template.retired_at) return true;
  const retiredMs = Date.parse(template.retired_at);
  return Number.isNaN(retiredMs) || retiredMs > Date.now();
}

function compactId(value) {
  return value ? String(value).slice(0, 10) : 'unknown';
}

function formatDateTime(value) {
  if (!value) return 'unknown';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? String(value) : new Date(ms).toLocaleString();
}

function toDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function bumpVersion(version) {
  const raw = String(version || '').trim();
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (match) return `${match[1]}.${Number(match[2] || 0) + 1}`;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return raw ? `${raw}-${stamp}`.slice(0, 60) : '1.0';
}

function templateToForm(template, forceNextVersion = false) {
  return {
    template_key: template?.template_key || '',
    role: template?.role || 'athlete',
    version: forceNextVersion ? bumpVersion(template?.version) : template?.version || '1.0',
    title: template?.title || '',
    body: template?.body || '',
    required: template?.required !== false,
    effective_at: toDateTimeInput(template?.effective_at),
    jurisdiction: template?.jurisdiction || '',
  };
}

function normalizeTemplateForm(form) {
  return {
    ...form,
    template_key: String(form.template_key || '').trim(),
    title: String(form.title || '').trim(),
    body: String(form.body || '').trim(),
    version: String(form.version || '').trim(),
    jurisdiction: String(form.jurisdiction || '').trim(),
    effective_at: fromDateTimeInput(form.effective_at),
    required: form.required === true,
  };
}

function templateStatusBadge(template) {
  if (!templateActive(template)) {
    return <Badge className="border-muted-foreground/20 bg-secondary text-muted-foreground">Retired</Badge>;
  }
  return template.required
    ? <Badge className="border-accent/20 bg-accent/10 text-accent">Required</Badge>
    : <Badge className="border-border bg-secondary text-muted-foreground">Optional</Badge>;
}

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
  const [viewTemplate, setViewTemplate] = useState(null);
  const [templateDialog, setTemplateDialog] = useState(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [retiringId, setRetiringId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [agreementDialog, setAgreementDialog] = useState(null);

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

  const agreementCountByTemplate = useMemo(() => {
    const map = new Map();
    for (const agreement of agreements) {
      const templateId = agreement.template_id || '';
      if (templateId) map.set(templateId, (map.get(templateId) || 0) + 1);
    }
    return map;
  }, [agreements]);

  const templatesById = useMemo(() => {
    const map = new Map();
    for (const template of templates) map.set(template.id, template);
    return map;
  }, [templates]);

  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => {
    const activeDelta = Number(templateActive(b)) - Number(templateActive(a));
    if (activeDelta) return activeDelta;
    return String(a.role || '').localeCompare(String(b.role || ''))
      || String(a.template_key || '').localeCompare(String(b.template_key || ''))
      || String(b.version || '').localeCompare(String(a.version || ''));
  }), [templates]);

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
    requiredTemplates: templates.filter((template) => template.required && templateActive(template)).length,
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

  const startCreateTemplate = () => {
    setTemplateDialog({ mode: 'create', template: null, signedCount: 0 });
    setTemplateForm({ ...emptyTemplateForm, effective_at: toDateTimeInput(new Date().toISOString()) });
  };

  const startEditTemplate = (template) => {
    const signedCount = agreementCountByTemplate.get(template.id) || 0;
    setTemplateDialog({ mode: 'edit', template, signedCount });
    setTemplateForm(templateToForm(template, signedCount > 0));
  };

  const saveTemplate = async () => {
    const payload = normalizeTemplateForm(templateForm);
    if (!payload.template_key || !payload.title || !payload.version || !payload.body) {
      toast.error('Template key, title, version, and body are required.');
      return;
    }
    setSavingTemplate(true);
    try {
      const result = templateDialog?.mode === 'edit'
        ? await legalTemplateRepo.updateAdmin(templateDialog.template.id, payload)
        : await legalTemplateRepo.createAdmin(payload);
      toast.success(result?.created_new_version ? 'New legal template version created' : 'Legal template saved');
      setTemplateDialog(null);
      setTemplateForm(emptyTemplateForm);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not save legal template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const retireTemplate = async (template) => {
    if (!window.confirm(`Retire "${template.title}"? Retired templates stop being required for new signatures.`)) return;
    setRetiringId(template.id);
    try {
      await legalTemplateRepo.retireAdmin(template.id);
      toast.success('Legal template retired');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not retire legal template.');
    } finally {
      setRetiringId('');
    }
  };

  const deleteTemplate = async (template) => {
    const signedCount = agreementCountByTemplate.get(template.id) || 0;
    if (signedCount > 0) {
      toast.error('This document has signed agreements. Retire it instead so the legal history stays available.');
      return;
    }
    if (!window.confirm(`Delete "${template.title}" from Appwrite? This only works for documents with no signed agreements.`)) return;
    setDeletingId(template.id);
    try {
      await legalTemplateRepo.deleteAdmin(template.id);
      toast.success('Legal document deleted');
      if (viewTemplate?.id === template.id) setViewTemplate(null);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Could not delete legal document.');
    } finally {
      setDeletingId('');
    }
  };

  const templateActions = (template) => {
    if (!template) return null;
    const signedCount = agreementCountByTemplate.get(template.id) || 0;
    const isRetired = !templateActive(template);

    if (signedCount > 0) {
      return isRetired ? null : (
        <Button size="sm" variant="ghost" disabled={retiringId === template.id} onClick={() => retireTemplate(template)} className="h-8 text-xs">
          <Archive className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {retiringId === template.id ? 'Retiring' : 'Retire'}
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={deletingId === template.id}
        onClick={() => deleteTemplate(template)}
        className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {deletingId === template.id ? 'Deleting' : 'Delete'}
      </Button>
    );
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
              View full legal text, create or version templates by role, audit signed agreements, generate PDFs, and add internal notes.
            </p>
          </div>
          <Button onClick={startCreateTemplate} className="bg-accent text-accent-foreground font-semibold hover:bg-accent/90">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New document
          </Button>
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
              <Label className="text-xs font-semibold text-muted-foreground">Search signed agreements</Label>
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

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Templates</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Edit unsigned templates in place. Signed templates save legal-text changes as a new version.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={startCreateTemplate} className="h-8 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
              </Button>
            </div>
            <div className="divide-y divide-border">
              {templates.length === 0 && !loading && (
                <p className="p-4 text-sm text-muted-foreground">No legal templates found.</p>
              )}
              {sortedTemplates.map((template) => {
                const signedCount = agreementCountByTemplate.get(template.id) || 0;
                return (
                  <div key={template.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{template.title}</p>
                          {templateStatusBadge(template)}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {template.template_key} · {ROLE_LABELS[template.role] || template.role} · v{template.version}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {signedCount} signed · effective {formatDateTime(template.effective_at)}
                        </p>
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {template.body}
                        </p>
                        <p className="mt-2 font-mono text-[10px] text-muted-foreground">{template.checksum || 'checksum pending'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewTemplate(template)} className="h-8 text-xs">
                        <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> View full
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEditTemplate(template)} className="h-8 text-xs">
                        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </Button>
                      {templateActions(template)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">Signed agreements</h2>
              <p className="mt-1 text-xs text-muted-foreground">Signed status comes from the server-created legal agreement row.</p>
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
                        {agreement.template_key} v{agreement.template_version} · signed {formatDateTime(agreement.signed_at)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {agreement.signer_email || 'no email'} · profile {compactId(agreement.signer_profile_id)} · IP {agreement.ip_address || 'unknown'}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        signature {agreement.signature_hash || 'pending'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAgreementDialog(agreement)} className="h-8 text-xs">
                        <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Details
                      </Button>
                      {agreement.pdf_file_id ? (
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <a href={legalPdfUrl(agreement.pdf_file_id)} target="_blank" rel="noreferrer">
                            <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> PDF
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={generatingId === agreement.id} onClick={() => ensurePdf(agreement)} className="h-8 text-xs">
                          <RotateCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {generatingId === agreement.id ? 'Generating' : 'Generate'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setNoteDialog(agreement); setNote(''); }} className="h-8 text-xs">
                        <NotebookPen className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Note
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={!!viewTemplate} onOpenChange={(open) => !open && setViewTemplate(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">{viewTemplate?.title}</DialogTitle>
            <DialogDescription>
              {viewTemplate?.template_key} · {ROLE_LABELS[viewTemplate?.role] || viewTemplate?.role} · v{viewTemplate?.version}
            </DialogDescription>
          </DialogHeader>
          <TemplateMeta template={viewTemplate} signedCount={agreementCountByTemplate.get(viewTemplate?.id) || 0} />
          <div className="rounded-md border border-border bg-secondary/30 p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">{viewTemplate?.body}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTemplate(null)}>Close</Button>
            {viewTemplate && (
              <>
                {templateActions(viewTemplate)}
                <Button onClick={() => { const template = viewTemplate; setViewTemplate(null); startEditTemplate(template); }} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!templateDialog} onOpenChange={(open) => !open && setTemplateDialog(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">
              {templateDialog?.mode === 'edit' ? 'Edit legal document' : 'Create legal document'}
            </DialogTitle>
            <DialogDescription>
              {templateDialog?.signedCount > 0
                ? 'This document has signatures. Text, title, role, key, or jurisdiction changes save as a new version.'
                : 'Assign the document to a role and choose whether it is required for that legal packet.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template key">
              <Input value={templateForm.template_key} onChange={(event) => setTemplateForm((current) => ({ ...current, template_key: event.target.value }))} className="bg-background" placeholder="athlete_payment_terms" />
            </Field>
            <Field label="Role">
              <Select value={templateForm.role} onValueChange={(role) => setTemplateForm((current) => ({ ...current, role }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role] || role}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title">
              <Input value={templateForm.title} onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))} className="bg-background" placeholder="Document title" />
            </Field>
            <Field label="Version">
              <Input value={templateForm.version} onChange={(event) => setTemplateForm((current) => ({ ...current, version: event.target.value }))} className="bg-background" placeholder="1.0" />
            </Field>
            <Field label="Jurisdiction">
              <Input value={templateForm.jurisdiction} onChange={(event) => setTemplateForm((current) => ({ ...current, jurisdiction: event.target.value }))} className="bg-background" placeholder="Michigan, United States" />
            </Field>
            <Field label="Effective at">
              <Input type="datetime-local" value={templateForm.effective_at} onChange={(event) => setTemplateForm((current) => ({ ...current, effective_at: event.target.value }))} className="bg-background" />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={templateForm.required}
              onChange={(event) => setTemplateForm((current) => ({ ...current, required: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-border accent-blue-600"
            />
            <span>Required for this role&apos;s legal packet</span>
          </label>

          <Field label="Full document text">
            <Textarea
              value={templateForm.body}
              onChange={(event) => setTemplateForm((current) => ({ ...current, body: event.target.value }))}
              rows={18}
              className="min-h-96 bg-background font-mono text-sm leading-6"
              placeholder="Paste or write the full legal document text..."
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(null)}>Cancel</Button>
            <Button disabled={savingTemplate} onClick={saveTemplate} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Save className="mr-2 h-4 w-4" aria-hidden="true" /> {savingTemplate ? 'Saving...' : 'Save document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!agreementDialog} onOpenChange={(open) => !open && setAgreementDialog(null)}>
        <AgreementDetails
          agreement={agreementDialog}
          template={agreementDialog ? templatesById.get(agreementDialog.template_id) : null}
          generating={generatingId === agreementDialog?.id}
          onGenerate={ensurePdf}
          onNote={(agreement) => { setAgreementDialog(null); setNoteDialog(agreement); setNote(''); }}
        />
      </Dialog>

      <Dialog open={!!noteDialog} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Add legal note</DialogTitle>
            <DialogDescription>
              {noteDialog?.template_key} · {noteDialog?.typed_legal_name || noteDialog?.signer_email}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="bg-secondary border-border" placeholder="Internal admin note..." />
          <Button disabled={savingNote || !note.trim()} onClick={saveNote} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {savingNote ? 'Saving...' : 'Save note'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TemplateMeta({ template, signedCount }) {
  if (!template) return null;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
      <p><span className="font-semibold text-foreground">Status:</span> {templateActive(template) ? 'Active' : `Retired ${formatDateTime(template.retired_at)}`}</p>
      <p><span className="font-semibold text-foreground">Required:</span> {template.required ? 'Yes' : 'No'}</p>
      <p><span className="font-semibold text-foreground">Effective:</span> {formatDateTime(template.effective_at)}</p>
      <p><span className="font-semibold text-foreground">Signed rows:</span> {signedCount}</p>
      <p className="sm:col-span-2"><span className="font-semibold text-foreground">Checksum:</span> <span className="font-mono">{template.checksum || 'pending'}</span></p>
    </div>
  );
}

function AgreementDetails({ agreement, template, generating, onGenerate, onNote }) {
  if (!agreement) return null;
  const checksumMatches = !template || !agreement.template_checksum || agreement.template_checksum === template.checksum;
  return (
    <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card border-border">
      <DialogHeader>
        <DialogTitle className="font-display tracking-tight">Signed agreement</DialogTitle>
        <DialogDescription>
          {agreement.template_key} v{agreement.template_version} · {agreement.typed_legal_name || agreement.signer_email}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={agreement.status === 'signed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-secondary text-muted-foreground'}>
          {STATUS_LABELS[agreement.status] || agreement.status || 'Signed'}
        </Badge>
        <Badge variant="outline">{ROLE_LABELS[agreement.signer_role] || agreement.signer_role}</Badge>
        {!agreement.pdf_file_id && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Missing PDF</Badge>}
        {!checksumMatches && <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Template changed</Badge>}
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p><span className="font-semibold text-foreground">Signer:</span> {agreement.typed_legal_name || 'unknown'}</p>
        <p><span className="font-semibold text-foreground">Email:</span> {agreement.signer_email || 'unknown'}</p>
        <p><span className="font-semibold text-foreground">Signed:</span> {formatDateTime(agreement.signed_at)}</p>
        <p><span className="font-semibold text-foreground">IP:</span> {agreement.ip_address || 'unknown'}</p>
        <p><span className="font-semibold text-foreground">Profile:</span> {agreement.signer_profile_id || 'unknown'}</p>
        <p><span className="font-semibold text-foreground">Account:</span> {agreement.signer_account_id || 'unknown'}</p>
        <p><span className="font-semibold text-foreground">Athlete:</span> {agreement.athlete_id || 'none'}</p>
        <p><span className="font-semibold text-foreground">Coach:</span> {agreement.coach_id || 'none'}</p>
        <p><span className="font-semibold text-foreground">Organization:</span> {agreement.organization_id || 'none'}</p>
        <p><span className="font-semibold text-foreground">Method:</span> {agreement.signature_method || 'typed'}</p>
        <p className="sm:col-span-2"><span className="font-semibold text-foreground">Signature hash:</span> <span className="font-mono">{agreement.signature_hash || 'pending'}</span></p>
        <p className="sm:col-span-2"><span className="font-semibold text-foreground">Template checksum at signing:</span> <span className="font-mono">{agreement.template_checksum || 'pending'}</span></p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Affirmations</p>
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-secondary/30 p-3 text-xs leading-5 text-foreground">
          {agreement.affirmations_json || '{}'}
        </pre>
      </div>

      {template && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current matching template text</p>
          {!checksumMatches && (
            <p className="mb-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-muted-foreground">
              This current template checksum does not match the checksum captured at signing. Use the signed PDF as the authoritative copy.
            </p>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-secondary/30 p-4 font-sans text-sm leading-6 text-foreground">
            {template.body}
          </pre>
        </div>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onNote(agreement)}>
          <NotebookPen className="mr-2 h-4 w-4" aria-hidden="true" /> Note
        </Button>
        {agreement.pdf_file_id ? (
          <Button asChild variant="outline">
            <a href={legalPdfUrl(agreement.pdf_file_id)} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Open PDF
            </a>
          </Button>
        ) : (
          <Button variant="outline" disabled={generating} onClick={() => onGenerate(agreement)}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" /> {generating ? 'Generating...' : 'Generate PDF'}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
