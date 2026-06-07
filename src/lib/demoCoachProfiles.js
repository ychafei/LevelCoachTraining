const demoAvailability = (start = '16:00', end = '20:00', days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday']) => {
  const availability = {};
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((day) => {
    availability[day] = {
      enabled: days.includes(day),
      start,
      end,
    };
  });
  return availability;
};

const counties = ['Oakland', 'Macomb', 'Wayne'];

const demoRows = [
  ['Soccer', 'Lisa', 'Rodriguez', 'LevelCoach Training', 'Rochester Hills', '/homepage-coach-lisa-avatar.png', 75, ['1-on-1', 'College Prep', 'Finishing', 'Ball Control']],
  ['Soccer', 'Marcus', 'Thompson', 'Next Level Soccer Academy', 'Sterling Heights', '/homepage-coach-marcus-avatar.png', 65, ['Speed & Agility', 'First Touch', 'Game IQ', 'Small Group']],
  ['Soccer', 'Ava', 'Bennett', 'Metro Skills Lab', 'Royal Oak', '', 70, ['Goalkeeper Training', 'Footwork', 'Confidence', 'Youth Athletes']],
  ['Soccer', 'Diego', 'Santos', 'Santos Player Development', 'Detroit', '', 80, ['Striker Training', 'College Prep', '1v1 Attacking', 'Film Review']],
  ['Soccer', 'Nia', 'Carter', 'Blue Line Performance', 'Troy', '', 68, ['Defending', 'Passing', 'Game IQ', 'Team Prep']],

  ['Basketball', 'Jordan', 'Williams', 'Elite Hoops Training', 'Detroit', '/homepage-coach-jordan-avatar.png', 60, ['Shooting', 'Ball Handling', 'Strength Training', 'Finishing']],
  ['Basketball', 'Maya', 'Chen', 'Court IQ Academy', 'Novi', '', 72, ['Footwork', 'Shooting Form', 'College Prep', 'Guard Skills']],
  ['Basketball', 'Andre', 'Miller', 'Motor City Hoops Lab', 'Southfield', '', 78, ['Explosiveness', 'Game IQ', '1-on-1', 'Small Group']],
  ['Basketball', 'Serena', 'Brooks', 'Next Shot Performance', 'Farmington Hills', '', 64, ['Shooting', 'Confidence', 'Youth Athletes', 'Conditioning']],
  ['Basketball', 'Caleb', 'Price', 'Rim Ready Training', 'Dearborn', '', 70, ['Post Moves', 'Rebounding', 'Strength', 'Finishing']],

  ['Football', 'Malik', 'Reed', 'Gridiron Prep Lab', 'Warren', '', 82, ['Speed & Agility', 'Route Running', 'College Prep', 'Strength']],
  ['Football', 'Ethan', 'Walker', 'Next Down Performance', 'Livonia', '', 76, ['Quarterback Mechanics', 'Footwork', 'Film Review', 'Game IQ']],
  ['Football', 'Jalen', 'Moore', 'Motor City Skill Works', 'Detroit', '', 74, ['Defensive Backs', 'Reaction Time', '1-on-1', 'Conditioning']],
  ['Football', 'Sofia', 'Grant', 'Athlete Edge Training', 'Birmingham', '', 68, ['Flag Football', 'Youth Athletes', 'Speed', 'Confidence']],
  ['Football', 'Noah', 'Hayes', 'Line Ready Academy', 'Macomb', '', 85, ['Line Play', 'Strength Training', 'Explosiveness', 'Technique']],

  ['Baseball', 'Owen', 'Parker', 'Diamond Skills Studio', 'Royal Oak', '', 70, ['Hitting', 'Fielding', 'Throwing Mechanics', 'Youth Athletes']],
  ['Baseball', 'Camila', 'Torres', 'Metro Bat Lab', 'Detroit', '', 74, ['Hitting Approach', 'Soft Toss', 'College Prep', 'Confidence']],
  ['Baseball', 'Henry', 'Kim', 'Pitch Smart Academy', 'Troy', '', 80, ['Pitching', 'Arm Care', 'Mechanics', 'Game IQ']],
  ['Baseball', 'Sam', 'Dawson', 'Infield IQ Training', 'Sterling Heights', '', 66, ['Infield Footwork', 'Throwing', 'Speed & Agility', 'Small Group']],
  ['Baseball', 'Layla', 'Morgan', 'Complete Player Baseball', 'Novi', '', 72, ['Catching', 'Pop Time', 'Strength', 'Leadership']],

  ['Volleyball', 'Grace', 'Evans', 'Net Gain Volleyball', 'Birmingham', '', 68, ['Serving', 'Setting', 'Footwork', 'Youth Athletes']],
  ['Volleyball', 'Priya', 'Patel', 'Volley IQ Academy', 'Canton', '', 76, ['Setting', 'Game IQ', 'College Prep', 'Small Group']],
  ['Volleyball', 'Taylor', 'Robinson', 'Elevate Volleyball Lab', 'Detroit', '', 72, ['Jump Training', 'Hitting', 'Strength', 'Explosiveness']],
  ['Volleyball', 'Isabella', 'Martinez', 'Serve Strong Training', 'Rochester', '', 64, ['Serving', 'Confidence', 'Passing', '1-on-1']],
  ['Volleyball', 'Harper', 'Lee', 'Block Party Performance', 'Macomb', '', 70, ['Blocking', 'Defense', 'Speed & Agility', 'Team Prep']],
];

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const DEMO_COACH_PROFILES = demoRows.map((row, index) => {
  const [sport, first, last, organization, city, photoUrl, price, specializations] = row;
  const county = counties[index % counties.length];
  const daySets = [
    ['Monday', 'Wednesday', 'Friday'],
    ['Tuesday', 'Thursday', 'Saturday'],
    ['Monday', 'Tuesday', 'Thursday'],
    ['Wednesday', 'Friday', 'Saturday'],
    ['Tuesday', 'Wednesday', 'Sunday'],
  ];
  return {
    id: `demo-${slug(sport)}-${slug(first)}-${slug(last)}`,
    is_demo: true,
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00.000Z',
    first_name: first,
    last_name: last,
    organization_name: organization,
    primary_sport: sport,
    sports: [sport],
    county,
    training_area: `${city}, MI`,
    photo_url: photoUrl,
    quote: `${sport} coaching built around clear goals, useful feedback, and confident reps.`,
    bio: `${first} is a demo LevelCoach profile used to preview how athletes compare coaches before the marketplace goes live. This sample profile shows how specialties, location, pricing, and availability will appear once real coaches complete their profiles.`,
    specializations,
    training_formats: ['1-on-1', 'Small Group'],
    age_groups: ['Youth', 'Teen', 'High School'],
    intro_price: price,
    session_rate: price,
    rating_avg: 4.8 + ((index % 3) * 0.1),
    review_count: 24 + (index * 3),
    availability: demoAvailability(
      index % 2 === 0 ? '16:00' : '17:00',
      index % 2 === 0 ? '20:00' : '21:00',
      daySets[index % daySets.length],
    ),
  };
});

export const DEMO_COACH_PROFILE_COUNT = DEMO_COACH_PROFILES.length;

export function getDemoCoachById(id) {
  return DEMO_COACH_PROFILES.find((coach) => coach.id === id) || null;
}
