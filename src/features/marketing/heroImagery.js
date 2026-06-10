// Curated Unsplash CDN imagery for the public marketing surface. Generic,
// non-identifying athletic/training action shots only — never presented as a
// specific real coach. Each entry pairs a stable photo id with descriptive alt
// text. URLs use the documented transform (auto=format&fit=crop) and a width
// tuned to the slot so total image weight stays reasonable.
//
// Every consumer must render these over a CSS gradient (see GradientImage) and
// lazy-load all but the LCP hero image.

const BASE = 'https://images.unsplash.com';

function unsplash(id, width = 1600, quality = 70) {
  return `${BASE}/${id}?auto=format&fit=crop&w=${width}&q=${quality}`;
}

export const MARKETING_IMAGES = {
  // Landing — primary hero (LCP, loaded eager). Athlete sprinting on a track.
  landingHero: {
    src: unsplash('photo-1461896836934-ffe607ba8211', 1280),
    alt: 'A sprinter pushing off the blocks on an outdoor running track at sunrise.',
  },
  // Landing — secondary collage tiles.
  basketballAction: {
    src: unsplash('photo-1546519638-68e109498ffc', 900),
    alt: 'A basketball player driving toward the hoop in an indoor arena.',
  },
  soccerTraining: {
    src: unsplash('photo-1551958219-acbc608c6377', 900),
    alt: 'A soccer player controlling the ball during a training session on a grass pitch.',
  },
  // For Athletes hero — athlete training with intensity.
  athletesHero: {
    src: unsplash('photo-1517649763962-0c623066013b', 1280),
    alt: 'A young athlete training hard in a gym, mid-movement with focus.',
  },
  // For Parents hero — youth sport in a supportive setting.
  parentsHero: {
    src: unsplash('photo-1526232761682-d26e03ac148e', 1280),
    alt: 'A youth soccer player on a sunny field during a coached training session.',
  },
  // For Coaches hero — a coach leading a training session.
  coachesHero: {
    src: unsplash('photo-1571019613454-1cb2f99b2d8b', 1280),
    alt: 'A coach leading a training session.',
  },
  // For Organizations hero — a team huddle / roster.
  organizationsHero: {
    src: unsplash('photo-1517466787929-bc90951d0974', 1280),
    alt: 'A team of athletes huddled together before training.',
  },
  // How It Works — supporting band image.
  trackStart: {
    src: unsplash('photo-1552674605-db6ffd4facb5', 1280),
    alt: 'Runners set in starting blocks on a track, ready to race.',
  },
  // About — editorial training shot.
  aboutTeam: {
    src: unsplash('photo-1431324155629-1a6deb1dec8d', 1280),
    alt: 'A group of athletes training together on a field at golden hour.',
  },
};

export default MARKETING_IMAGES;
