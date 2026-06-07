import { Client, Databases, ID, Permission, Query, Role, Storage } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { createHash } from 'node:crypto';
import { jsPDF } from 'jspdf';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'levelcoach';
const LEGAL_BUCKET_ID = process.env.LEGAL_DOCUMENTS_BUCKET_ID || 'legal-documents';

const SIGNER_TO_TEMPLATE_ROLE = {
  athlete: 'athlete',
  guardian: 'guardian',
  coach: 'coach',
  organization_admin: 'organization',
  admin: 'admin',
};

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), storage: new Storage(client) };
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

function header(req, names) {
  for (const name of names) {
    const value = req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];
    if (value) return String(value);
  }
  return '';
}

function callerAccountId(req) {
  return header(req, ['x-appwrite-user-id', 'X-Appwrite-User-Id', 'X-Appwrite-User-ID']);
}

async function profileForAccount(databases, accountId) {
  const rows = await databases.listDocuments(DB_ID, 'profiles', [
    Query.equal('account_id', accountId),
    Query.limit(1),
  ]);
  return rows.documents[0] || null;
}

function sha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function templateChecksum(template) {
  return template.checksum || sha256([
    template.template_key,
    template.role,
    template.version,
    template.title,
    template.body,
    template.jurisdiction,
  ].join('\n'));
}

function affirmationsValid(signerRole, affirmations) {
  const a = affirmations || {};
  if (a.electronic_records_consent !== true) return false;
  if (a.reviewed_current_template !== true) return false;
  if (a.accurate_information !== true) return false;
  if ((signerRole === 'guardian' || signerRole === 'organization_admin') && a.legal_authority !== true) return false;
  return true;
}

function signatureMethod(payload) {
  return payload.drawn_signature_data ? 'typed_and_drawn' : 'typed';
}

function legalPdfPermissions(accountId) {
  const permissions = [
    Permission.read(Role.label('admin')),
    Permission.read(Role.label('super_admin')),
  ];
  if (accountId) permissions.unshift(Permission.read(Role.user(accountId)));
  return permissions;
}

function addWrapped(doc, text, x, y, width, lineHeight = 12) {
  const lines = doc.splitTextToSize(String(text || ''), width);
  for (const line of lines) {
    if (y > 742) {
      doc.addPage();
      y = 54;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function createPdf(storage, template, agreement, payload) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 54;
  let y = 60;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  y = addWrapped(doc, template.title || 'LevelCoach Legal Agreement', margin, y, 500, 16);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y = addWrapped(doc, `Template: ${agreement.template_key || template.template_key} v${agreement.template_version || template.version}`, margin, y, 500);
  y = addWrapped(doc, `Signed at: ${agreement.signed_at || ''}`, margin, y + 2, 500);
  y = addWrapped(doc, `Signer: ${agreement.typed_legal_name || ''} (${agreement.signer_role || ''})`, margin, y + 2, 500);
  y = addWrapped(doc, `Signer profile/account: ${agreement.signer_profile_id || ''} / ${agreement.signer_account_id || ''}`, margin, y + 2, 500);
  y = addWrapped(doc, `IP/User agent: ${agreement.ip_address || ''} / ${agreement.user_agent || ''}`, margin, y + 2, 500);
  y = addWrapped(doc, `Template checksum: ${agreement.template_checksum || ''}`, margin, y + 2, 500);
  y = addWrapped(doc, `Signature hash: ${agreement.signature_hash || ''}`, margin, y + 2, 500);
  y = addWrapped(doc, `Signature method: ${agreement.signature_method || 'typed'}`, margin, y + 2, 500);
  if (agreement.drawn_signature_hash) {
    y = addWrapped(doc, `Drawn signature hash: ${agreement.drawn_signature_hash}`, margin, y + 2, 500);
  }

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('Electronic Consent and Affirmations', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  y = addWrapped(doc, payload.affirmations_json || agreement.affirmations_json || '', margin, y, 500, 11);

  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Agreement Text', margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  addWrapped(doc, template.body || '', margin, y, 500, 11);

  const bytes = Buffer.from(doc.output('arraybuffer'));
  const year = new Date(agreement.signed_at || Date.now()).getUTCFullYear();
  const filename = `${year}-${agreement.signer_role}-${agreement.template_key || template.template_key}-${agreement.$id}.pdf`;
  return storage.createFile(
    LEGAL_BUCKET_ID,
    ID.unique(),
    InputFile.fromBuffer(bytes, filename),
    legalPdfPermissions(agreement.signer_account_id),
  );
}

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const payload = body(req);
    const templateId = payload.template_id;
    const signerRole = payload.signer_role;
    const typedLegalName = String(payload.typed_legal_name || '').trim();
    const affirmations = payload.affirmations || {};
    const expectedTemplateRole = SIGNER_TO_TEMPLATE_ROLE[signerRole];

    if (!templateId) return res.json({ error: 'template_id is required.' }, 400);
    if (!expectedTemplateRole) return res.json({ error: 'Unsupported signer_role.' }, 400);
    if (typedLegalName.length < 3) return res.json({ error: 'Typed legal name is required.' }, 400);
    if (!affirmationsValid(signerRole, affirmations)) {
      return res.json({ error: 'Required electronic consent affirmations are incomplete.' }, 400);
    }

    const { databases, storage } = services();
    const profile = await profileForAccount(databases, accountId);
    if (!profile) return res.json({ error: 'No profile found for signer.' }, 404);

    const template = await databases.getDocument(DB_ID, 'legal_templates', templateId);
    if (template.role !== expectedTemplateRole) {
      return res.json({ error: `Template role ${template.role} cannot be signed as ${signerRole}.` }, 400);
    }
    if (template.retired_at && new Date(template.retired_at).getTime() <= Date.now()) {
      return res.json({ error: 'This legal template is retired.' }, 400);
    }

    const signedAt = new Date().toISOString();
    const checksum = templateChecksum(template);
    const ipAddress = header(req, ['x-forwarded-for', 'x-real-ip']).split(',')[0].trim();
    const userAgent = header(req, ['user-agent']).slice(0, 1000);
    const affirmationsJson = JSON.stringify(affirmations);
    const drawnSignatureHash = payload.drawn_signature_data ? sha256(payload.drawn_signature_data) : '';
    const signaturePayload = {
      template_id: template.$id,
      template_key: template.template_key,
      template_version: template.version,
      template_checksum: checksum,
      signer_profile_id: profile.$id,
      signer_account_id: accountId,
      signer_email: profile.email || '',
      signer_role: signerRole,
      signer_relationship: String(payload.signer_relationship || '').trim(),
      typed_legal_name: typedLegalName,
      athlete_id: payload.athlete_id || '',
      coach_id: payload.coach_id || profile.coach_id || '',
      organization_id: payload.organization_id || profile.primary_organization_id || '',
      signed_at: signedAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      affirmations_json: affirmationsJson,
      signature_method: signatureMethod(payload),
      drawn_signature_hash: drawnSignatureHash,
    };
    const signatureHash = sha256(JSON.stringify(signaturePayload));

    const agreement = await databases.createDocument(DB_ID, 'legal_agreements', ID.unique(), {
      ...signaturePayload,
      signature_hash: signatureHash,
      status: 'signed',
    });

    const pdf = await createPdf(storage, template, agreement, { affirmations_json: affirmationsJson });
    const updated = await databases.updateDocument(DB_ID, 'legal_agreements', agreement.$id, {
      pdf_file_id: pdf.$id,
    });

    await databases.createDocument(DB_ID, 'audit_logs', ID.unique(), {
      actor_email: profile.email || '',
      actor_role: profile.role || 'user',
      action: 'legal_agreement.sign',
      entity_type: 'LegalAgreement',
      entity_id: agreement.$id,
      after: JSON.stringify({
        template_key: template.template_key,
        template_version: template.version,
        signer_role: signerRole,
        pdf_file_id: pdf.$id,
      }),
      metadata: JSON.stringify({
        signer_profile_id: profile.$id,
        athlete_id: signaturePayload.athlete_id,
        coach_id: signaturePayload.coach_id,
        organization_id: signaturePayload.organization_id,
      }),
    }).catch(() => {});

    return res.json({
      agreement_id: updated.$id,
      pdf_file_id: updated.pdf_file_id,
      signature_hash: updated.signature_hash,
      signed_at: updated.signed_at,
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not sign legal agreement.', detail: err?.message || String(err) }, 500);
  }
};
