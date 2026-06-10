// Public availability endpoint. Returns ONLY bookable windows and opaque busy
// ranges — never session documents, client fields, or prices.
import { Client, Databases, Query } from 'node-appwrite';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'lctraining';
const MAX_RANGE_DAYS = 31;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function db() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  return new Databases(client);
}

function body(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;
  try { return JSON.parse(req.bodyRaw || req.body || '{}'); } catch { return {}; }
}

// Cursor pagination so coaches with >500 rows are handled completely.
async function listAll(databases, collectionId, queries, max = 5000) {
  const out = [];
  let cursor = null;
  while (out.length < max) {
    const page = await databases.listDocuments(DB_ID, collectionId, [
      ...queries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    out.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return out;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

function endTimeFor(startTime, durationMinutes) {
  const [h, m] = String(startTime || '00:00').split(':').map(Number);
  const total = Math.min((h * 60 + m) + (Number(durationMinutes) || 60), 23 * 60 + 59);
  const eh = String(Math.floor(total / 60)).padStart(2, '0');
  const em = String(total % 60).padStart(2, '0');
  return `${eh}:${em}`;
}

function parseAvailability(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export default async ({ req, res, error }) => {
  try {
    const payload = body(req);
    const coachId = String(payload.coach_id || '');
    if (!coachId) return res.json({ error: 'coach_id is required.' }, 400);

    let startDate = String(payload.start_date || '');
    let endDate = String(payload.end_date || '');
    if (!DATE_RE.test(startDate)) startDate = todayIso();
    if (!DATE_RE.test(endDate)) endDate = addDays(startDate, MAX_RANGE_DAYS - 1);
    if (endDate < startDate) return res.json({ error: 'end_date must be on or after start_date.' }, 400);
    if (daysBetween(startDate, endDate) >= MAX_RANGE_DAYS) {
      endDate = addDays(startDate, MAX_RANGE_DAYS - 1);
    }

    const databases = db();
    const coach = await databases.getDocument(DB_ID, 'coaches', coachId).catch(() => null);
    if (!coach) return res.json({ error: 'Coach not found.' }, 404);

    const [availBlocks, coachBlocks, sessions] = await Promise.all([
      listAll(databases, 'availability_blocks', [
        Query.equal('coach_id', coachId),
        Query.equal('active', true),
      ]).catch(() => []),
      listAll(databases, 'coach_blocks', [
        Query.equal('coach_id', coachId),
        Query.equal('is_active', true),
      ]).catch(() => []),
      listAll(databases, 'sessions', [
        Query.equal('coach_id', coachId),
        Query.equal('status', ['pending', 'confirmed']),
        Query.greaterThanEqual('date', startDate),
        Query.lessThanEqual('date', endDate),
      ]).catch(() => []),
    ]);

    // Bookable windows: recurring/date availability blocks + legacy JSON schedule.
    const windows = availBlocks
      .filter((block) => block.block_type !== 'blackout')
      .filter((block) => block.block_type !== 'date' || (block.date >= startDate && block.date <= endDate))
      .map((block) => ({
        block_type: block.block_type || 'recurring',
        day: block.day || '',
        date: block.date || '',
        start_time: block.start_time || '',
        end_time: block.end_time || '',
        location: block.location || '',
        session_type: block.session_type || '',
        capacity: Number(block.capacity) || 1,
      }));

    // Opaque busy ranges — no document ids, names, or prices.
    const busy = [];
    for (const session of sessions) {
      busy.push({
        date: session.date,
        start_time: session.start_time,
        end_time: endTimeFor(session.start_time, session.duration_minutes),
      });
    }
    for (const block of coachBlocks) {
      const from = block.start_date > startDate ? block.start_date : startDate;
      const to = block.end_date < endDate ? block.end_date : endDate;
      if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) continue;
      for (let date = from; date <= to; date = addDays(date, 1)) {
        busy.push({
          date,
          start_time: block.block_all_day === false ? (block.blocked_start_time || '00:00') : '00:00',
          end_time: block.block_all_day === false ? (block.blocked_end_time || '23:59') : '23:59',
        });
      }
    }
    for (const block of availBlocks) {
      if (block.block_type !== 'blackout') continue;
      if (!block.date || block.date < startDate || block.date > endDate) continue;
      busy.push({
        date: block.date,
        start_time: block.start_time || '00:00',
        end_time: block.end_time || '23:59',
      });
    }
    busy.sort((a, b) => (a.date === b.date ? (a.start_time < b.start_time ? -1 : 1) : (a.date < b.date ? -1 : 1)));

    return res.json({
      coach_id: coachId,
      timezone: coach.timezone || 'America/Detroit',
      start_date: startDate,
      end_date: endDate,
      availability: parseAvailability(coach.availability),
      windows,
      busy,
    });
  } catch (err) {
    error?.(err?.message || String(err));
    return res.json({ error: 'Could not load coach availability.' }, 500);
  }
};
