import { Client, Databases, Storage, ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { jsPDF } from 'jspdf';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const LEGAL_BUCKET_ID = process.env.LEGAL_DOCUMENTS_BUCKET_ID || 'legal-documents';

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

function canGenerate(actor, agreement) {
  if (!actor) return false;
  if (actor.role === 'admin' || actor.role === 'super_admin') return true;
  if (agreement.signer_profile_id === actor.$id) return true;
  if (agreement.organization_id && actor.primary_organization_id === agreement.organization_id) return true;
  return false;
}

function legalPdfPermissions(accountId) {
  const permissions = [
    Permission.read(Role.label('admin')),
    Permission.read(Role.label('super_admin')),
  ];
  if (accountId) permissions.unshift(Permission.read(Role.user(accountId)));
  return permissions;
}

function addWrapped(doc, text, x, y, width, lineHeight = 14) {
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

export default async ({ req, res, error }) => {
  try {
    const accountId = callerAccountId(req);
    if (!accountId) return res.json({ error: 'Authentication required.' }, 401);

    const { agreement_id } = body(req);
    if (!agreement_id) return res.json({ error: 'agreement_id is required.' }, 400);

    const { databases, storage } = services();
    const actor = await profileForAccount(databases, accountId);
    const agreement = await databases.getDocument(DB_ID, 'legal_agreements', agreement_id);
    if (!canGenerate(actor, agreement)) {
      return res.json({ error: 'You do not have access to this legal agreement.' }, 403);
    }
    if (agreement.pdf_file_id) {
      return res.json({ agreement_id: agreement.$id, pdf_file_id: agreement.pdf_file_id, already_exists: true });
    }

    const template = await databases.getDocument(DB_ID, 'legal_templates', agreement.template_id);

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const margin = 54;
    let y = 60;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(template.title || 'LevelCoach Legal Agreement', margin, y);
    y += 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y = addWrapped(doc, `Template: ${template.template_key || agreement.template_key || ''} v${template.version || agreement.template_version || ''}`, margin, y, 480, 12);
    y = addWrapped(doc, `Signed at: ${agreement.signed_at || ''}`, margin, y + 4, 480, 12);
    y = addWrapped(doc, `Signer: ${agreement.typed_legal_name || agreement.signer_profile_id || ''} (${agreement.signer_role || ''})`, margin, y + 4, 480, 12);
    y = addWrapped(doc, `Signer profile/account: ${agreement.signer_profile_id || ''} / ${agreement.signer_account_id || ''}`, margin, y + 4, 480, 12);
    y = addWrapped(doc, `Template checksum: ${agreement.template_checksum || template.checksum || ''}`, margin, y + 4, 480, 12);
    y = addWrapped(doc, `Signature hash: ${agreement.signature_hash || ''}`, margin, y + 4, 480, 12);
    y = addWrapped(doc, `Signature method: ${agreement.signature_method || 'typed'}`, margin, y + 4, 480, 12);
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('Electronic Consent and Affirmations', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    y = addWrapped(doc, agreement.affirmations_json || '', margin, y, 500, 11);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Agreement Text', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    addWrapped(doc, template.body || '', margin, y, 500, 11);

    const bytes = Buffer.from(doc.output('arraybuffer'));
    const filename = `${agreement.template_key || template.template_key || 'agreement'}-${agreement.$id}.pdf`;
    const created = await storage.createFile(
      LEGAL_BUCKET_ID,
      ID.unique(),
      InputFile.fromBuffer(bytes, filename),
      legalPdfPermissions(agreement.signer_account_id),
    );
    await databases.updateDocument(DB_ID, 'legal_agreements', agreement.$id, {
      pdf_file_id: created.$id,
    });

    return res.json({ agreement_id: agreement.$id, pdf_file_id: created.$id });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not generate legal agreement PDF.', detail: err?.message || String(err) }, 500);
  }
};
