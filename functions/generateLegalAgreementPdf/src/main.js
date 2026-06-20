import { Client, Databases, Storage, Users, ID, Permission, Query, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { jsPDF } from 'jspdf';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const LEGAL_BUCKET_ID = process.env.LEGAL_DOCUMENTS_BUCKET_ID || 'legal-documents';

function services() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return { databases: new Databases(client), storage: new Storage(client), users: new Users(client) };
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

async function callerIsBanned(databases, profile) {
  if (!profile?.email) return false;
  const rows = await databases.listDocuments(DB_ID, 'user_bans', [
    Query.equal('banned_email', profile.email),
    Query.equal('is_active', true),
    Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return rows.documents.length > 0;
}

// Authority is derived server-side: admin label (Users API), the signer
// themself, a verified org owner/admin, or a linked guardian of the athlete.
async function canGenerate(databases, users, accountId, actor, agreement) {
  const account = await users.get(accountId).catch(() => null);
  const labels = account?.labels || [];
  if (labels.includes('admin') || labels.includes('superadmin')) return true;
  if (!actor) return false;
  if (agreement.signer_profile_id === actor.$id) return true;
  if (agreement.organization_id) {
    const members = await databases.listDocuments(DB_ID, 'organization_members', [
      Query.equal('organization_id', agreement.organization_id),
      Query.equal('profile_id', actor.$id),
      Query.equal('status', 'active'),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    const member = members.documents[0];
    if (member && ['org_owner', 'org_admin'].includes(member.role)) return true;
  }
  if (agreement.athlete_id) {
    const links = await databases.listDocuments(DB_ID, 'guardian_athletes', [
      Query.equal('guardian_profile_id', actor.$id),
      Query.equal('athlete_id', agreement.athlete_id),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    if (links.documents[0]) return true;
  }
  return false;
}

function legalPdfPermissions(accountId) {
  const permissions = [
    Permission.read(Role.label('admin')),
    Permission.read(Role.label('superadmin')),
  ];
  if (accountId) permissions.unshift(Permission.read(Role.user(accountId)));
  return permissions;
}

function unknownAttributeName(err) {
  return /unknown attribute:?\s*"?([\w.-]+)"?/i.exec(err?.message || '')?.[1] || '';
}

async function updateDocumentResilient(databases, collectionId, documentId, data, optionalKeys = []) {
  const optional = new Set(optionalKeys);
  let payload = { ...data };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (Object.keys(payload).length === 0) return databases.getDocument(DB_ID, collectionId, documentId);
    try {
      return await databases.updateDocument(DB_ID, collectionId, documentId, payload);
    } catch (err) {
      const attr = unknownAttributeName(err);
      if (!attr || !optional.has(attr) || !(attr in payload)) throw err;
      delete payload[attr];
    }
  }
  return databases.updateDocument(DB_ID, collectionId, documentId, payload);
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

    const { databases, storage, users } = services();
    const actor = await profileForAccount(databases, accountId);
    if (await callerIsBanned(databases, actor)) {
      return res.json({ error: 'Account access is restricted.' }, 403);
    }
    const agreement = await databases.getDocument(DB_ID, 'legal_agreements', agreement_id);
    if (!(await canGenerate(databases, users, accountId, actor, agreement))) {
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
    await updateDocumentResilient(databases, 'legal_agreements', agreement.$id, {
      pdf_file_id: created.$id,
    }, ['pdf_file_id']);

    return res.json({ agreement_id: agreement.$id, pdf_file_id: created.$id });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not generate legal agreement PDF.' }, 500);
  }
};
