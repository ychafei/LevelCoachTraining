import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { generateLegalAgreementPdf, legalPdfUrl, signLegalAgreement } from '@/lib/legal';
import { useLegalPacketStatus } from '@/hooks/useLegalPacketStatus';
import { AlertTriangle, CheckCircle2, Download, FileText, PenLine, RotateCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.name || '';
}

function roleLabel(role) {
  const labels = {
    athlete: 'Athlete',
    guardian: 'Parent / Guardian',
    coach: 'Coach',
    organization_admin: 'Organization Admin',
    admin: 'Admin',
  };
  return labels[role] || role;
}

function needsAuthority(role) {
  return role === 'guardian' || role === 'organization_admin';
}

export default function LegalSignaturePanel({
  signerRole,
  athleteId = '',
  coachId = '',
  organizationId = '',
  title = 'Required Legal Packet',
  description = 'Review and sign the current required legal documents before continuing.',
  compact = false,
  onStatusChange = null,
}) {
  const { user } = useAuth();
  const status = useLegalPacketStatus({ user, signerRole, athleteId, coachId, organizationId });
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [typedName, setTypedName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [affirmations, setAffirmations] = useState({
    electronic_records_consent: false,
    reviewed_current_template: false,
    accurate_information: false,
    legal_authority: false,
  });
  const [saving, setSaving] = useState(false);
  const [drawnTouched, setDrawnTouched] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status.complete, status.loading, status.missing.length, status.templates.length]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTypedName(fullName(user));
    setRelationship(signerRole === 'guardian' ? 'Parent/Guardian' : signerRole === 'organization_admin' ? 'Authorized representative' : '');
    setAffirmations({
      electronic_records_consent: false,
      reviewed_current_template: false,
      accurate_information: false,
      legal_authority: false,
    });
    setDrawnTouched(false);
    clearCanvas();
  }, [selectedTemplate?.id]);

  const signedByTemplateId = useMemo(() => {
    const map = new Map();
    for (const item of status.signed) map.set(item.template.id, item.agreement);
    return map;
  }, [status.signed]);

  const canSign = selectedTemplate
    && typedName.trim().length >= 3
    && affirmations.electronic_records_consent
    && affirmations.reviewed_current_template
    && affirmations.accurate_information
    && (!needsAuthority(signerRole) || affirmations.legal_authority);

  const beginDrawing = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    drawingRef.current = true;
    setDrawnTouched(true);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
  };

  const endDrawing = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnTouched(false);
  };

  const signSelected = async () => {
    if (!canSign) return;
    setSaving(true);
    try {
      const drawnSignatureData = drawnTouched && canvasRef.current
        ? canvasRef.current.toDataURL('image/png')
        : '';
      await signLegalAgreement({
        template_id: selectedTemplate.id,
        signer_role: signerRole,
        signer_relationship: relationship.trim(),
        typed_legal_name: typedName.trim(),
        athlete_id: athleteId,
        coach_id: coachId,
        organization_id: organizationId,
        affirmations,
        drawn_signature_data: drawnSignatureData,
      });
      toast.success('Legal agreement signed');
      setSelectedTemplate(null);
      await status.refresh();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not sign legal agreement.');
    } finally {
      setSaving(false);
    }
  };

  const ensurePdf = async (agreement) => {
    try {
      const result = await generateLegalAgreementPdf(agreement.id);
      toast.success(result?.already_exists ? 'Signed copy is ready' : 'Signed copy generated');
      await status.refresh();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not generate signed copy.');
    }
  };

  if (status.loading) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="h-5 w-48 rounded bg-secondary/60 animate-pulse" />
        <div className="mt-4 h-20 rounded bg-secondary/40 animate-pulse" />
      </section>
    );
  }

  const summaryTone = status.complete ? 'text-green-500' : status.hasTemplates ? 'text-yellow-500' : 'text-destructive';

  if (compact && status.complete) {
    return (
      <section className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">All required {roleLabel(signerRole).toLowerCase()} documents are current.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge className={status.complete ? 'border-green-500/20 bg-green-500/10 text-green-500' : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500'}>
          {status.complete ? 'Complete' : `${status.missing.length} missing`}
        </Badge>
      </div>

      {status.error && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {status.error}
        </p>
      )}

      {!status.hasTemplates && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              No active required legal templates are published for {roleLabel(signerRole)}. Run `npm run legal:seed-templates` after provisioning Appwrite.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {status.templates.map((template) => {
          const agreement = signedByTemplateId.get(template.id);
          const signed = !!agreement;
          return (
            <div key={template.id} className="rounded-md border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-accent" />
                    <h3 className="text-sm font-semibold text-foreground">{template.title}</h3>
                    <Badge variant="outline" className="text-[10px]">v{template.version}</Badge>
                    {signed ? (
                      <Badge className="border-green-500/20 bg-green-500/10 text-green-500">Signed</Badge>
                    ) : (
                      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500">Required</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.jurisdiction || 'Jurisdiction pending'} · checksum {template.checksum?.slice(0, 10) || 'pending'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {signed && agreement.pdf_file_id && (
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                      <a href={legalPdfUrl(agreement.pdf_file_id)} target="_blank" rel="noreferrer">
                        <Download className="mr-1 h-3.5 w-3.5" /> Copy
                      </a>
                    </Button>
                  )}
                  {signed && !agreement.pdf_file_id && (
                    <Button size="sm" variant="outline" onClick={() => ensurePdf(agreement)} className="h-8 text-xs">
                      <RotateCw className="mr-1 h-3.5 w-3.5" /> PDF
                    </Button>
                  )}
                  {!signed && (
                    <Button size="sm" onClick={() => setSelectedTemplate(template)} className="h-8 bg-accent text-accent-foreground text-xs hover:bg-accent/90">
                      <PenLine className="mr-1 h-3.5 w-3.5" /> Review & Sign
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.title}</DialogTitle>
            <DialogDescription>
              {roleLabel(signerRole)} packet · v{selectedTemplate?.version}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-secondary/30 p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{selectedTemplate?.body}</pre>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="typed-legal-name">Typed legal signature</Label>
              <Input
                id="typed-legal-name"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                className="mt-1 bg-background"
                placeholder="Full legal name"
              />
            </div>
            <div>
              <Label htmlFor="signer-relationship">Relationship / authority</Label>
              <Input
                id="signer-relationship"
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                className="mt-1 bg-background"
                placeholder={needsAuthority(signerRole) ? 'Parent, guardian, owner, officer...' : 'Optional'}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-background/40 p-4">
            <CheckboxRow checked={affirmations.electronic_records_consent} onChange={(value) => setAffirmations((current) => ({ ...current, electronic_records_consent: value }))}>
              I consent to electronic records and electronic signatures for this document.
            </CheckboxRow>
            <CheckboxRow checked={affirmations.reviewed_current_template} onChange={(value) => setAffirmations((current) => ({ ...current, reviewed_current_template: value }))}>
              I reviewed the current template version and agree to sign it.
            </CheckboxRow>
            <CheckboxRow checked={affirmations.accurate_information} onChange={(value) => setAffirmations((current) => ({ ...current, accurate_information: value }))}>
              The account, signer, and related profile information I provided is accurate.
            </CheckboxRow>
            {needsAuthority(signerRole) && (
              <CheckboxRow checked={affirmations.legal_authority} onChange={(value) => setAffirmations((current) => ({ ...current, legal_authority: value }))}>
                I have legal authority to sign this document for the related minor athlete or organization.
              </CheckboxRow>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label>Optional drawn signature</Label>
              <Button type="button" variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs">
                Clear
              </Button>
            </div>
            <canvas
              ref={canvasRef}
              width={680}
              height={130}
              onPointerDown={beginDrawing}
              onPointerMove={draw}
              onPointerUp={endDrawing}
              onPointerLeave={endDrawing}
              className="mt-1 h-28 w-full touch-none rounded-md border border-border bg-white"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>Cancel</Button>
            <Button disabled={!canSign || saving} onClick={signSelected} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Signing...' : 'Sign Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className={`mt-4 text-xs ${summaryTone}`}>
        {status.complete
          ? 'All required current templates are signed.'
          : status.hasTemplates
            ? 'Required documents must be signed before booking, coach activation, or organization publishing.'
            : 'Legal templates must be seeded and reviewed before this gate can be completed.'}
      </p>
    </section>
  );
}

function CheckboxRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-blue-600"
      />
      <span>{children}</span>
    </label>
  );
}
