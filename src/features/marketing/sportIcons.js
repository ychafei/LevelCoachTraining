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
  Snowflake,
  Swords,
  Target,
  Trophy,
  Volleyball,
  Waves,
  Zap,
} from 'lucide-react';

// Maps the `icon` strings stored on SPORTS_CATALOG entries to lucide-react
// components so marketing surfaces render a consistent icon per sport.
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

export function sportIcon(iconKey) {
  return ICONS[iconKey] || Trophy;
}

export default sportIcon;
