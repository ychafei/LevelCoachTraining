import {
  Activity,
  CircleDashed,
  CircleDot,
  Crosshair,
  Dumbbell,
  Flag,
  Footprints,
  Goal,
  LandPlot,
  Medal,
  Snowflake,
  Swords,
  Target,
  Volleyball,
  Waves,
  Zap,
} from 'lucide-react';
import { SPORTS_CATALOG, getSport } from '@/lib/sportsCatalog';

// sportsCatalog stores lucide icon names in kebab-case; map them to components.
const ICONS = {
  goal: Goal,
  'circle-dot': CircleDot,
  flag: Flag,
  target: Target,
  'circle-dashed': CircleDashed,
  volleyball: Volleyball,
  crosshair: Crosshair,
  swords: Swords,
  snowflake: Snowflake,
  'land-plot': LandPlot,
  footprints: Footprints,
  waves: Waves,
  zap: Zap,
  dumbbell: Dumbbell,
  activity: Activity,
};

// Athlete profiles may store sports as catalog keys ('soccer') or display
// names ('Soccer'). Resolve either form back to the catalog entry.
export function resolveSport(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const byKey = getSport(raw) || getSport(raw.toLowerCase());
  if (byKey) return byKey;
  const lowered = raw.toLowerCase();
  return SPORTS_CATALOG.find((sport) => sport.display_name.toLowerCase() === lowered) || null;
}

export function sportDisplayName(value) {
  return resolveSport(value)?.display_name || String(value || '').trim();
}

export function sportIconFor(value) {
  const sport = resolveSport(value);
  return (sport && ICONS[sport.icon]) || Medal;
}

// True when `position` matches a known position for the sport — used to label
// position data straight from the catalog when present.
export function positionLabelFor(sportValue, position) {
  const sport = resolveSport(sportValue);
  const raw = String(position || '').trim();
  if (!raw) return '';
  if (!sport) return raw;
  const match = (sport.positions || []).find((p) => p.toLowerCase() === raw.toLowerCase());
  return match || raw;
}
