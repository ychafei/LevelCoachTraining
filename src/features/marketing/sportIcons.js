import {
  GiAmericanFootballBall,
  GiBaseballBat,
  GiBaseballGlove,
  GiBasketballBall,
  GiGolfFlag,
  GiHockey,
  GiIceSkate,
  GiPodiumWinner,
  GiRunningShoe,
  GiSoccerBall,
  GiSportMedal,
  GiSprint,
  GiTennisRacket,
  GiVolleyballBall,
  GiWeightLiftingUp,
} from 'react-icons/gi';
import { MdPool } from 'react-icons/md';
import { SPORTS_CATALOG } from '@/lib/sportsCatalog';

// REAL sport glyphs (react-icons: Game Icons set + Material's swimmer), keyed
// by catalog sport_key. These replaced the abstract lucide placeholders
// (radar-for-soccer, snowflake-for-hockey) — every glyph below reads as its
// sport at a glance. Filled single-path SVGs; size/color via className.
const GLYPHS = {
  soccer: GiSoccerBall,
  basketball: GiBasketballBall,
  football: GiAmericanFootballBall,
  baseball: GiBaseballGlove,
  softball: GiBaseballBat,
  volleyball: GiVolleyballBall,
  tennis: GiTennisRacket,
  lacrosse: GiHockey, // crossed sticks — reads as the stick sport
  hockey: GiIceSkate,
  golf: GiGolfFlag,
  track_field: GiSprint,
  swimming: MdPool,
  speed_agility: GiRunningShoe,
  strength_conditioning: GiWeightLiftingUp,
  general_performance: GiPodiumWinner,
};

// Canonical lookup by catalog sport_key. Falls back to a medal so a new
// catalog entry never renders blank.
export function sportGlyph(sportKey) {
  return GLYPHS[sportKey] || GiSportMedal;
}

// Back-compat: callers that pass the legacy catalog `icon` string resolve
// through the catalog to the same glyphs.
const ICON_KEY_TO_SPORT = Object.fromEntries(
  SPORTS_CATALOG.map((sport) => [sport.icon, sport.sport_key]),
);

export function sportIcon(iconKey) {
  return sportGlyph(ICON_KEY_TO_SPORT[iconKey] || iconKey);
}

export default sportIcon;
