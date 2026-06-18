// Multi-sport catalog (ARCHITECTURE.md §6). Each sport carries the data seeded into
// the `sports` collection: positions, specialties, levels, and an assessment_template
// of categories → skills scored on a 1-10 scale.

const DEFAULT_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Competitive Club',
  'High School',
  'College',
  'Professional',
];

function skill(key, label, description) {
  return { key, label, description };
}

function category(key, label, skills) {
  return { key, label, skills };
}

function assessmentTemplate(categories) {
  return { version: '1.0', scale: { min: 1, max: 10 }, categories };
}

export const SPORTS_CATALOG = [
  {
    sport_key: 'soccer',
    display_name: 'Soccer',
    category: 'team_sport',
    icon: 'goal',
    positions: [
      'Goalkeeper',
      'Center Back',
      'Full Back / Wing Back',
      'Defensive Midfielder',
      'Central Midfielder',
      'Attacking Midfielder',
      'Winger',
      'Striker / Forward',
    ],
    specialties: [
      'Finishing & Shooting',
      'First Touch & Ball Mastery',
      'Passing & Vision',
      '1v1 Attacking & Dribbling',
      'Defending & Tackling',
      'Goalkeeping',
      'Speed & Agility',
      'Tactical Awareness',
      'Position-Specific Training',
      'College Recruiting Preparation',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Technical', [
        skill('first_touch', 'First Touch', 'Controlling balls arriving on the ground and in the air with the first contact, at varying pace and under pressure.'),
        skill('short_passing', 'Short Passing', 'Accuracy, weight, and timing of passes over short distances with both feet.'),
        skill('long_passing', 'Long Passing', 'Driven, lofted, and switched passes over distance with accuracy and proper technique.'),
        skill('shooting', 'Shooting', 'Striking technique, power, and placement when shooting from distance and inside the box.'),
        skill('finishing', 'Finishing', 'Converting chances in and around the box with composure across different finish types.'),
        skill('weak_foot', 'Weak Foot', 'Confidence and quality using the non-dominant foot to receive, pass, and finish.'),
        skill('dribbling', 'Dribbling', 'Close control, change of direction, and ability to beat opponents in 1v1 situations.'),
        skill('ball_striking', 'Ball Striking', 'Clean contact across striking techniques: driven balls, lofted balls, volleys, and set-piece deliveries.'),
        skill('defending_technique', 'Defending Technique', 'Individual defending fundamentals: body shape, jockeying, timing of tackles, and recovery runs.'),
      ]),
      category('physical', 'Physical', [
        skill('acceleration', 'Acceleration', 'First-step quickness and acceleration over the first 5-15 yards.'),
        skill('top_speed', 'Top Speed', 'Maximum running speed in open-field situations.'),
        skill('agility', 'Agility', 'Change of direction and body control at speed.'),
        skill('conditioning', 'Conditioning', 'Repeated sprint ability and capacity to sustain work rate for a full match.'),
        skill('strength', 'Strength', 'Functional strength in duels, shielding, and contact situations.'),
      ]),
      category('tactical', 'Tactical', [
        skill('positioning', 'Positioning', 'Understanding of where to be in and out of possession for the role being played.'),
        skill('scanning_awareness', 'Scanning / Awareness', 'Frequency and quality of scanning; awareness of teammates, opponents, and space before receiving.'),
        skill('decision_making', 'Decision Making', 'Speed and quality of choices on the ball under pressure.'),
        skill('pressing', 'Pressing', 'Timing, angles, and trigger recognition when pressing the ball.'),
        skill('transition_play', 'Transition Play', 'Reactions and decisions in attack-to-defense and defense-to-attack moments.'),
      ]),
      category('goalkeeping', 'Goalkeeper (Position-Specific)', [
        skill('gk_handling', 'Handling', 'Catching and securing shots, crosses, and high balls cleanly.'),
        skill('gk_distribution', 'Distribution', 'Throwing, rolling, and kicking distribution; supporting build-up from the back.'),
        skill('gk_shot_stopping', 'Shot Stopping', 'Set position, footwork, diving technique, and reaction saves.'),
      ]),
      category('defending', 'Defender (Position-Specific)', [
        skill('def_one_v_one', '1v1 Defending', 'Isolated defending against attackers in wide and central areas.'),
        skill('def_aerial', 'Aerial Duels', 'Timing, positioning, and technique when challenging for balls in the air.'),
        skill('def_build_up', 'Build-Up Play', 'Composure and passing quality when building from the back under pressure.'),
      ]),
      category('midfield', 'Midfielder (Position-Specific)', [
        skill('mid_receiving_pressure', 'Receiving Under Pressure', 'Receiving on the half-turn and retaining possession in tight spaces.'),
        skill('mid_passing_range', 'Passing Range', 'Variety and accuracy of passing to switch play, penetrate lines, and set tempo.'),
        skill('mid_box_to_box', 'Box-to-Box Impact', 'Capacity to influence both penalty areas: arriving in attack and recovering in defense.'),
      ]),
      category('attacking', 'Forward (Position-Specific)', [
        skill('fwd_movement', 'Attacking Movement', 'Timing of runs, movement off the ball, and creating separation from defenders.'),
        skill('fwd_hold_up', 'Hold-Up Play', 'Receiving with back to goal, holding off defenders, and linking play.'),
        skill('fwd_finishing_variety', 'Finishing Variety', 'Range of finishes: one-touch, headers, near/far post, and breakaway situations.'),
      ]),
      category('mental', 'Mental', [
        skill('confidence', 'Confidence', 'Willingness to take touches, attempt actions, and recover quickly from mistakes.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
        skill('focus', 'Focus', 'Sustained concentration through drills, scrimmages, and full sessions.'),
        skill('match_readiness', 'Match Readiness', 'Translating training habits into competitive match performance.'),
        skill('competitiveness', 'Competitiveness', 'Intensity in duels, drive to win, and response to adversity.'),
      ]),
    ]),
  },
  {
    sport_key: 'basketball',
    display_name: 'Basketball',
    category: 'team_sport',
    icon: 'circle-dot',
    positions: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
    specialties: [
      'Ball Handling',
      'Shooting & Scoring',
      'Finishing at the Rim',
      'Perimeter Defense',
      'Post Play',
      'Athleticism & Vertical',
      'Basketball IQ & Film Study',
      'Guard Skills Development',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Skill', [
        skill('ball_handling', 'Ball Handling', 'Control with both hands at speed, under pressure, and through change of direction.'),
        skill('shooting_form', 'Shooting Form', 'Mechanics, balance, and consistency on catch-and-shoot and off-the-dribble jumpers.'),
        skill('free_throws', 'Free Throws', 'Routine and conversion consistency from the line.'),
        skill('finishing_at_rim', 'Finishing at the Rim', 'Layup package, use of either hand, and finishing through contact.'),
        skill('passing', 'Passing', 'Accuracy and timing of entry, skip, and assist passes with either hand.'),
      ]),
      category('physical', 'Physical', [
        skill('first_step', 'First-Step Quickness', 'Explosiveness attacking off the dribble and beating a closeout.'),
        skill('lateral_quickness', 'Lateral Quickness', 'Defensive slide speed and hip mobility staying in front of the ball.'),
        skill('vertical', 'Vertical Explosiveness', 'Jumping ability for rebounding, finishing, and shot contests.'),
        skill('conditioning', 'Conditioning', 'Capacity to sustain effort across quarters and repeated sprints.'),
      ]),
      category('tactical', 'Game Understanding', [
        skill('shot_selection', 'Shot Selection', 'Recognizing good shots within range, rhythm, and game context.'),
        skill('off_ball_movement', 'Off-Ball Movement', 'Cutting, relocating, and using screens to create advantages.'),
        skill('pick_and_roll', 'Pick-and-Roll Play', 'Reading coverages as a handler or screener and making the right play.'),
        skill('team_defense', 'Team Defense Awareness', 'Help positioning, rotations, and communication off the ball.'),
      ]),
      category('mental', 'Mental', [
        skill('composure', 'Composure', 'Poise with the ball under pressure and in late-game situations.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
        skill('competitiveness', 'Competitiveness', 'Intensity on both ends and response to adversity.'),
      ]),
    ]),
  },
  {
    sport_key: 'football',
    display_name: 'Football (American)',
    category: 'team_sport',
    icon: 'flag',
    positions: [
      'Quarterback',
      'Running Back',
      'Wide Receiver',
      'Tight End',
      'Offensive Line',
      'Defensive Line',
      'Linebacker',
      'Defensive Back',
      'Kicker / Punter',
    ],
    specialties: [
      'Quarterback Training',
      'Receiver Route Running',
      'Speed & Explosiveness',
      'Line Play & Technique',
      'Defensive Back Skills',
      'Strength Development',
      'Combine / Testing Preparation',
      'Film Study & Football IQ',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Technical', [
        skill('throwing_mechanics', 'Throwing Mechanics', 'Footwork, base, release, and accuracy across throw types and distances.'),
        skill('catching', 'Catching', 'Hands technique, tracking the ball, and securing catches in traffic.'),
        skill('route_running', 'Route Running', 'Stem quality, breaks, separation, and route timing.'),
        skill('blocking_technique', 'Blocking Technique', 'Hand placement, leverage, footwork, and finishing blocks.'),
        skill('tackling_form', 'Tackling Form', 'Safe, effective tackling technique: approach, leverage, wrap, and drive.'),
        skill('ball_security', 'Ball Security', 'Carriage fundamentals and protecting the ball through contact.'),
      ]),
      category('physical', 'Physical', [
        skill('speed', 'Speed', 'Linear speed in open-field and pursuit situations.'),
        skill('explosive_power', 'Explosive Power', 'Burst out of stance, off the line, and through contact.'),
        skill('change_of_direction', 'Change of Direction', 'Cutting, redirect, and short-area quickness.'),
        skill('conditioning', 'Conditioning', 'Capacity to sustain effort across drives and repeated plays.'),
      ]),
      category('tactical', 'Football IQ', [
        skill('play_recognition', 'Play Recognition', 'Reading keys, alignments, and recognizing concepts pre- and post-snap.'),
        skill('field_vision', 'Field Vision', 'Seeing the field, finding lanes, and locating leverage and space.'),
        skill('situational_awareness', 'Situational Awareness', 'Understanding down-and-distance, clock, and game-situation decisions.'),
      ]),
      category('mental', 'Mental', [
        skill('composure', 'Composure', 'Poise under pressure and bounce-back after mistakes.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
        skill('competitiveness', 'Competitiveness', 'Effort, physical toughness, and finishing through the whistle.'),
      ]),
    ]),
  },
  {
    sport_key: 'baseball',
    display_name: 'Baseball',
    category: 'team_sport',
    icon: 'target',
    positions: ['Pitcher', 'Catcher', 'First Base', 'Second Base', 'Shortstop', 'Third Base', 'Outfield', 'Utility'],
    specialties: [
      'Hitting Mechanics',
      'Pitching Development',
      'Catching & Receiving',
      'Infield Defense',
      'Outfield Defense',
      'Base Running & Speed',
      'Arm Care & Velocity',
      'Recruiting / Showcase Preparation',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('hitting', 'Hitting', [
        skill('swing_mechanics', 'Swing Mechanics', 'Load, sequence, bat path, and balance through the swing.'),
        skill('plate_discipline', 'Plate Discipline', 'Pitch recognition, strike-zone judgment, and swing decisions.'),
        skill('contact_consistency', 'Contact Consistency', 'Barrel control and quality of contact across pitch types and locations.'),
        skill('power_development', 'Power Development', 'Bat speed and ability to drive the ball with intent.'),
      ]),
      category('defense', 'Fielding', [
        skill('glove_work', 'Glove Work', 'Receiving, fielding clean hops, and transfer quality.'),
        skill('fielding_footwork', 'Fielding Footwork', 'Pre-pitch preparation, angles, and footwork through the ball.'),
        skill('arm_strength', 'Arm Strength', 'Throwing velocity and carry for the position.'),
        skill('throwing_accuracy', 'Throwing Accuracy', 'Accuracy and exchange speed on throws under game tempo.'),
      ]),
      category('pitching', 'Pitching', [
        skill('pitching_mechanics', 'Pitching Mechanics', 'Delivery sequencing, balance, and repeatability.'),
        skill('command', 'Command', 'Ability to locate pitches to both sides of the plate.'),
        skill('pitch_development', 'Pitch Development', 'Quality and consistency of secondary pitches and pitch mix.'),
      ]),
      category('athleticism_mental', 'Athleticism & Mental', [
        skill('base_running', 'Base Running', 'Reads, leads, turns, and decision-making on the bases.'),
        skill('sprint_speed', 'Sprint Speed', 'Home-to-first and overall running speed.'),
        skill('focus', 'Focus', 'Pitch-to-pitch concentration and routine quality.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'softball',
    display_name: 'Softball',
    category: 'team_sport',
    icon: 'circle-dashed',
    positions: ['Pitcher', 'Catcher', 'First Base', 'Second Base', 'Shortstop', 'Third Base', 'Outfield', 'Utility'],
    specialties: [
      'Hitting & Slap Hitting',
      'Windmill Pitching',
      'Catching Skills',
      'Infield Defense',
      'Outfield Defense',
      'Speed & Base Running',
      'Recruiting / Showcase Preparation',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('hitting', 'Hitting', [
        skill('swing_mechanics', 'Swing Mechanics', 'Load, sequence, bat path, and balance through the swing.'),
        skill('plate_discipline', 'Plate Discipline', 'Pitch recognition, strike-zone judgment, and swing decisions against movement and speed changes.'),
        skill('contact_consistency', 'Contact Consistency', 'Barrel control and quality of contact across pitch types and locations.'),
        skill('situational_hitting', 'Situational Hitting', 'Executing slaps, bunts, hit-and-run, and productive at-bats by situation.'),
      ]),
      category('defense', 'Fielding', [
        skill('glove_work', 'Glove Work', 'Receiving, fielding clean hops, and transfer quality.'),
        skill('fielding_footwork', 'Fielding Footwork', 'Pre-pitch preparation, angles, and footwork through the ball.'),
        skill('arm_strength', 'Arm Strength', 'Throwing velocity and carry for the position.'),
        skill('throwing_accuracy', 'Throwing Accuracy', 'Accuracy and exchange speed on throws at game tempo.'),
      ]),
      category('pitching', 'Pitching', [
        skill('windmill_mechanics', 'Windmill Mechanics', 'Arm circle, drive mechanics, balance, and repeatability.'),
        skill('command', 'Command', 'Ability to locate pitches to spots in and around the zone.'),
        skill('spin_and_movement', 'Spin & Movement', 'Quality of movement pitches: rise, drop, curve, screw, and change.'),
      ]),
      category('athleticism_mental', 'Athleticism & Mental', [
        skill('base_running', 'Base Running', 'Reads, leads, turns, and aggressive but smart decisions on the bases.'),
        skill('sprint_speed', 'Sprint Speed', 'Home-to-first and overall running speed.'),
        skill('focus', 'Focus', 'Pitch-to-pitch concentration and routine quality.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'volleyball',
    display_name: 'Volleyball',
    category: 'team_sport',
    icon: 'volleyball',
    positions: ['Setter', 'Outside Hitter', 'Opposite Hitter', 'Middle Blocker', 'Libero / Defensive Specialist'],
    specialties: [
      'Serving',
      'Serve Receive & Passing',
      'Setting',
      'Hitting / Attacking',
      'Blocking',
      'Defense & Digging',
      'Vertical & Explosiveness',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Technical', [
        skill('serving', 'Serving', 'Consistency, placement, and pace across float and topspin serves.'),
        skill('serve_receive', 'Serve Receive', 'Platform control and passing accuracy to target under serve pressure.'),
        skill('setting', 'Setting', 'Hand quality, location consistency, and tempo control.'),
        skill('attacking', 'Attacking', 'Approach footwork, arm swing mechanics, and hitting range.'),
        skill('blocking', 'Blocking', 'Footwork along the net, timing, hand penetration, and press.'),
        skill('digging', 'Defense & Digging', 'Reading attackers, defensive positioning, and ball control on hard-driven balls.'),
      ]),
      category('physical', 'Physical', [
        skill('vertical_jump', 'Vertical Jump', 'Jump height and repeated jump capacity at the net.'),
        skill('lateral_movement', 'Lateral Movement', 'Quickness covering the court and recovering to base position.'),
        skill('conditioning', 'Conditioning', 'Capacity to sustain quality across long rallies and full matches.'),
      ]),
      category('tactical', 'Court Sense', [
        skill('court_positioning', 'Court Positioning', 'Understanding rotations, base positions, and coverage responsibilities.'),
        skill('reading_attackers', 'Reading the Attack', 'Anticipating shots from the setter\'s and hitter\'s body language.'),
        skill('shot_selection', 'Shot Selection', 'Choosing the right attack: swing, tip, roll shot, or tool by situation.'),
      ]),
      category('mental', 'Mental', [
        skill('composure', 'Composure', 'Point-to-point reset and poise in pressure rotations.'),
        skill('communication', 'Communication', 'Calling the ball, talking through plays, and energizing teammates.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'tennis',
    display_name: 'Tennis',
    category: 'individual_sport',
    icon: 'crosshair',
    positions: ['Singles', 'Doubles'],
    specialties: [
      'Serve Development',
      'Groundstroke Technique',
      'Net Play & Volleys',
      'Footwork & Movement',
      'Match Strategy',
      'Junior Tournament Preparation',
      'UTR / Ranking Development',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Technical', [
        skill('forehand', 'Forehand', 'Mechanics, consistency, depth, and ability to dictate with the forehand.'),
        skill('backhand', 'Backhand', 'Mechanics, consistency, and reliability under pace on the backhand side.'),
        skill('serve', 'Serve', 'Toss, motion, placement, and variety across first and second serves.'),
        skill('return_of_serve', 'Return of Serve', 'Reading the serve, compact contact, and neutralizing or attacking returns.'),
        skill('volleys', 'Volleys & Net Play', 'Volley technique, hands at the net, and finishing overheads.'),
        skill('slice_variety', 'Slice & Variety', 'Slice, drop shots, lobs, and ability to change pace and height.'),
      ]),
      category('movement', 'Movement', [
        skill('court_speed', 'Court Speed', 'Speed to the ball and ability to cover the full court.'),
        skill('footwork_patterns', 'Footwork Patterns', 'Split step, adjustment steps, and balance at contact.'),
        skill('recovery_positioning', 'Recovery & Positioning', 'Recovering to the right court position between shots.'),
      ]),
      category('tactical', 'Tactical', [
        skill('point_construction', 'Point Construction', 'Building points with patterns, depth, and purposeful shot sequences.'),
        skill('shot_selection', 'Shot Selection', 'Choosing the right shot for the situation, score, and opponent.'),
        skill('adaptability', 'Adaptability', 'Adjusting tactics to surfaces, conditions, and opponent styles.'),
      ]),
      category('mental', 'Mental', [
        skill('composure', 'Composure Under Pressure', 'Managing nerves on big points and closing out sets.'),
        skill('between_point_routines', 'Between-Point Routines', 'Reset routines, breathing, and consistency of preparation.'),
        skill('competitiveness', 'Competitiveness', 'Problem-solving fight and sustained intensity across a match.'),
      ]),
    ]),
  },
  {
    sport_key: 'lacrosse',
    display_name: 'Lacrosse',
    category: 'team_sport',
    icon: 'swords',
    positions: ['Attack', 'Midfield', 'Defense', 'Goalie', 'Faceoff Specialist (FOGO)', 'Long Stick Midfielder (LSM)'],
    specialties: [
      'Stick Skills',
      'Shooting & Scoring',
      'Dodging',
      'Defensive Footwork',
      'Goalie Training',
      'Faceoffs',
      'Wall Ball & Fundamentals',
      'Speed & Conditioning',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Stick Skills', [
        skill('cradling', 'Cradling', 'Ball control on the move with both hands and under pressure.'),
        skill('passing', 'Passing', 'Accuracy and pace of passes on the run with either hand.'),
        skill('catching', 'Catching', 'Soft hands receiving passes in traffic and on the run.'),
        skill('shooting', 'Shooting', 'Mechanics, power, placement, and deception on time-and-room and on-the-run shots.'),
        skill('ground_balls', 'Ground Balls', 'Technique, toughness, and consistency winning 50/50 ground balls.'),
        skill('stick_protection', 'Stick Protection', 'Protecting the stick through dodges, checks, and pressure.'),
      ]),
      category('physical', 'Physical', [
        skill('speed', 'Speed', 'Open-field speed in transition and on dodges.'),
        skill('agility', 'Agility', 'Change of direction, footwork, and short-area quickness.'),
        skill('conditioning', 'Conditioning', 'Capacity to run the field at pace for full games.'),
      ]),
      category('tactical', 'Game Sense', [
        skill('off_ball_movement', 'Off-Ball Movement', 'Cutting, spacing, and creating opportunities away from the ball.'),
        skill('defensive_positioning', 'Defensive Positioning', 'Approach angles, body position, and sliding/recovering within team defense.'),
        skill('transition_play', 'Transition Play', 'Decision-making and execution in clears, rides, and fast breaks.'),
      ]),
      category('mental', 'Mental', [
        skill('composure', 'Composure', 'Poise with the ball under pressure and after mistakes.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
        skill('competitiveness', 'Competitiveness', 'Toughness in ground-ball battles and sustained compete level.'),
      ]),
    ]),
  },
  {
    sport_key: 'hockey',
    display_name: 'Ice Hockey',
    category: 'team_sport',
    icon: 'snowflake',
    positions: ['Center', 'Wing', 'Defense', 'Goaltender'],
    specialties: [
      'Skating & Edge Work',
      'Stickhandling',
      'Shooting & Scoring',
      'Defensive Play',
      'Goaltending',
      'Power Skating',
      'Off-Ice Strength & Conditioning',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('technical', 'Technical', [
        skill('skating_stride', 'Skating Stride', 'Stride mechanics, extension, and skating efficiency forward and backward.'),
        skill('edge_work', 'Edge Work', 'Edges, crossovers, tight turns, and transitions at speed.'),
        skill('stickhandling', 'Stickhandling', 'Puck control in tight spaces, at speed, and with head up.'),
        skill('passing', 'Passing', 'Accuracy and pace of saucer, tape-to-tape, and breakout passes.'),
        skill('shooting', 'Shooting', 'Wrist, snap, and slap shot mechanics; release speed and accuracy.'),
        skill('puck_protection', 'Puck Protection', 'Body positioning and stick control to shield the puck under pressure.'),
      ]),
      category('physical', 'Physical', [
        skill('skating_speed', 'Skating Speed', 'Acceleration and top speed on the ice.'),
        skill('strength_balance', 'Strength & Balance', 'Strength on the puck, balance through contact, and battle ability.'),
        skill('conditioning', 'Conditioning', 'Shift-to-shift recovery and capacity to sustain pace.'),
      ]),
      category('tactical', 'Hockey Sense', [
        skill('positioning', 'Positioning', 'Understanding lanes, support positions, and zone responsibilities.'),
        skill('gap_control', 'Gap Control', 'Managing gaps and angles defending the rush.'),
        skill('offensive_support', 'Offensive Support', 'Finding soft ice, timing routes, and supporting the puck carrier.'),
      ]),
      category('mental', 'Mental', [
        skill('compete_level', 'Compete Level', 'Battle intensity in board play, net-front, and 50/50 pucks.'),
        skill('composure', 'Composure', 'Poise with the puck under forecheck pressure.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'golf',
    display_name: 'Golf',
    category: 'individual_sport',
    icon: 'land-plot',
    positions: [],
    specialties: [
      'Full Swing',
      'Short Game',
      'Putting',
      'Course Management',
      'Junior Golf Development',
      'Tournament Preparation',
      'Swing Analysis Technology',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced', 'Junior Competitive', 'High School', 'College', 'Amateur Tournament', 'Professional'],
    assessment_template: assessmentTemplate([
      category('full_swing', 'Full Swing', [
        skill('driver_performance', 'Driver Performance', 'Distance, dispersion, and confidence off the tee.'),
        skill('iron_play', 'Iron Play', 'Contact quality, distance control, and proximity with irons.'),
        skill('swing_mechanics', 'Swing Mechanics', 'Grip, posture, sequencing, and repeatability of the swing.'),
        skill('ball_striking', 'Ball Striking', 'Consistency of strike location and ability to control flight and shape.'),
      ]),
      category('short_game', 'Short Game', [
        skill('chipping', 'Chipping', 'Technique and landing-spot control on greenside chips.'),
        skill('pitching', 'Pitching', 'Distance control and trajectory variety from 30-80 yards.'),
        skill('bunker_play', 'Bunker Play', 'Setup, technique, and consistency from greenside sand.'),
        skill('putting', 'Putting', 'Stroke mechanics, green reading, speed control, and short-putt conversion.'),
      ]),
      category('course_management', 'Course Management', [
        skill('shot_planning', 'Shot Planning', 'Choosing targets and shots that fit the hole and current skill set.'),
        skill('club_selection', 'Club Selection', 'Selecting clubs based on carry numbers, lie, wind, and conditions.'),
        skill('risk_management', 'Risk Management', 'Knowing when to attack and when to play safe; avoiding big numbers.'),
      ]),
      category('mental', 'Mental', [
        skill('pre_shot_routine', 'Pre-Shot Routine', 'Consistency and quality of routine before every shot.'),
        skill('composure', 'Composure', 'Staying level after bad shots and managing scoring pressure.'),
        skill('focus', 'Focus', 'Sustaining concentration across a full round or practice session.'),
      ]),
    ]),
  },
  {
    sport_key: 'track_field',
    display_name: 'Track & Field',
    category: 'individual_sport',
    icon: 'footprints',
    positions: ['Sprints', 'Hurdles', 'Middle Distance', 'Distance', 'Jumps', 'Throws', 'Multi-Events'],
    specialties: [
      'Sprint Mechanics',
      'Block Starts & Acceleration',
      'Hurdle Technique',
      'Distance Training',
      'Jumps (Long / Triple / High)',
      'Throws (Shot / Discus / Javelin)',
      'Speed Development',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('sprint_speed', 'Sprints & Speed', [
        skill('block_starts', 'Block Starts', 'Set position, reaction, and drive phase out of the blocks.'),
        skill('acceleration_phase', 'Acceleration Phase', 'Body angles, force application, and build-up through 30 meters.'),
        skill('max_velocity_mechanics', 'Max Velocity Mechanics', 'Posture, front-side mechanics, and turnover at top speed.'),
        skill('speed_endurance', 'Speed Endurance', 'Maintaining velocity through the late stages of a race.'),
      ]),
      category('distance', 'Middle Distance & Distance', [
        skill('aerobic_base', 'Aerobic Base', 'Aerobic capacity supporting event-appropriate training volume.'),
        skill('pacing', 'Pacing', 'Hitting goal splits and distributing effort across a race.'),
        skill('race_strategy', 'Race Strategy', 'Positioning, surges, and finishing tactics in competition.'),
      ]),
      category('field_events', 'Field Events', [
        skill('approach_consistency', 'Approach Consistency', 'Run-up rhythm, accuracy, and takeoff/release preparation.'),
        skill('jump_technique', 'Jump Technique', 'Takeoff, flight, and landing mechanics for the athlete\'s jump events.'),
        skill('throw_technique', 'Throw Technique', 'Footwork, sequencing, and release mechanics for the athlete\'s throw events.'),
      ]),
      category('foundation', 'Athletic Foundation', [
        skill('strength_power', 'Strength & Power', 'General and event-specific strength and explosive power.'),
        skill('mobility', 'Mobility', 'Range of motion supporting safe, efficient technique.'),
        skill('competition_readiness', 'Competition Readiness', 'Warm-up routines, meet-day preparation, and handling competition nerves.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'swimming',
    display_name: 'Swimming',
    category: 'individual_sport',
    icon: 'waves',
    positions: ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Open Water'],
    specialties: [
      'Stroke Technique',
      'Starts & Turns',
      'Sprint Training',
      'Distance Training',
      'Race Strategy',
      'Dryland Conditioning',
    ],
    levels: DEFAULT_LEVELS,
    assessment_template: assessmentTemplate([
      category('stroke_technique', 'Stroke Technique', [
        skill('freestyle_technique', 'Freestyle Technique', 'Body position, catch, pull pattern, kick, and breathing rhythm.'),
        skill('backstroke_technique', 'Backstroke Technique', 'Body line, rotation, catch, and consistent kick tempo.'),
        skill('breaststroke_technique', 'Breaststroke Technique', 'Timing of pull-breathe-kick-glide and streamline between cycles.'),
        skill('butterfly_technique', 'Butterfly Technique', 'Body undulation, two-kick timing, and sustainable rhythm.'),
      ]),
      category('starts_turns', 'Starts, Turns & Finishes', [
        skill('start_technique', 'Start Technique', 'Block setup, reaction, entry, and breakout quality.'),
        skill('turns', 'Turns', 'Flip and open turn speed, wall push-off, and streamline.'),
        skill('underwater_work', 'Underwater Work', 'Dolphin kick power and distance off walls within legal limits.'),
        skill('finishes', 'Finishes', 'Timing and technique of the final stroke into the wall.'),
      ]),
      category('conditioning', 'Conditioning', [
        skill('aerobic_capacity', 'Aerobic Capacity', 'Endurance base supporting event-appropriate training sets.'),
        skill('sprint_power', 'Sprint Power', 'Top-end speed and power for sprint events and finishes.'),
        skill('kick_strength', 'Kick Strength', 'Kick propulsion and conditioning across strokes.'),
      ]),
      category('racing_mental', 'Racing & Mental', [
        skill('pacing', 'Pacing', 'Even splitting and race-plan execution by event.'),
        skill('race_composure', 'Race Composure', 'Managing nerves behind the blocks and executing under pressure.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'speed_agility',
    display_name: 'Speed & Agility Training',
    category: 'performance_training',
    icon: 'zap',
    positions: [],
    specialties: [
      'Linear Speed',
      'Acceleration Mechanics',
      'Change of Direction',
      'Plyometrics',
      'Footwork',
      'Combine / Testing Preparation',
      'Sport-Specific Movement',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced', 'Competitive Athlete', 'High School', 'College', 'Professional'],
    assessment_template: assessmentTemplate([
      category('linear_speed', 'Linear Speed', [
        skill('acceleration_mechanics', 'Acceleration Mechanics', 'Body angles, force application, and stride pattern through the first 10-20 yards.'),
        skill('max_velocity', 'Max Velocity', 'Top speed, posture, and front-side mechanics at full sprint.'),
        skill('sprint_posture', 'Sprint Posture', 'Pelvic position, arm action, and alignment throughout the sprint.'),
      ]),
      category('agility', 'Agility & Change of Direction', [
        skill('change_of_direction', 'Change of Direction', 'Cutting mechanics, angle creation, and re-acceleration out of cuts.'),
        skill('lateral_quickness', 'Lateral Quickness', 'Lateral movement speed, shuffles, and crossover efficiency.'),
        skill('deceleration_control', 'Deceleration Control', 'Braking mechanics and body control when stopping at speed.'),
        skill('footwork_patterns', 'Footwork Patterns', 'Precision and rhythm in ladder, cone, and reactive footwork work.'),
      ]),
      category('power', 'Explosive Power', [
        skill('jump_mechanics', 'Jump Mechanics', 'Takeoff and landing technique in vertical and broad jumps.'),
        skill('reactive_power', 'Reactive Power', 'Elastic, ground-contact quickness in plyometric and rebound tasks.'),
        skill('single_leg_power', 'Single-Leg Power', 'Unilateral force production and stability in bounds and hops.'),
      ]),
      category('movement_quality', 'Movement Quality & Mindset', [
        skill('body_control', 'Body Control', 'Coordination and balance through complex movement patterns.'),
        skill('effort_consistency', 'Effort Consistency', 'Quality of intent and effort across every rep.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
  {
    sport_key: 'strength_conditioning',
    display_name: 'Strength & Conditioning',
    category: 'performance_training',
    icon: 'dumbbell',
    positions: [],
    specialties: [
      'Foundational Strength',
      'Olympic Lifting Progressions',
      'Power Development',
      'Injury Risk Reduction',
      'In-Season Maintenance',
      'Return-to-Play Support',
      'Youth Strength Foundations',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced', 'Competitive Athlete', 'High School', 'College', 'Professional'],
    assessment_template: assessmentTemplate([
      category('foundational_strength', 'Foundational Strength', [
        skill('squat_pattern', 'Squat Pattern', 'Technique, depth, and control across squat variations appropriate to the athlete.'),
        skill('hinge_pattern', 'Hinge Pattern', 'Hip hinge quality in deadlift and RDL variations with a neutral spine.'),
        skill('upper_press', 'Upper-Body Press', 'Pressing technique, control, and strength in horizontal and vertical pressing.'),
        skill('upper_pull', 'Upper-Body Pull', 'Pulling strength and control in rows and pull-up progressions.'),
      ]),
      category('power', 'Power Development', [
        skill('jump_land_mechanics', 'Jump & Land Mechanics', 'Safe, explosive takeoff and landing technique.'),
        skill('triple_extension', 'Explosive Triple Extension', 'Hip-knee-ankle extension quality in jumps, throws, and lift derivatives.'),
        skill('med_ball_power', 'Medicine Ball Power', 'Rotational and overhead power expression with medicine ball work.'),
      ]),
      category('conditioning', 'Conditioning', [
        skill('aerobic_capacity', 'Aerobic Capacity', 'Aerobic base supporting training volume and recovery.'),
        skill('anaerobic_capacity', 'Anaerobic Capacity', 'Repeated high-intensity effort tolerance and recovery between bouts.'),
        skill('work_capacity', 'Work Capacity', 'Ability to maintain movement quality across a full training session.'),
      ]),
      category('durability', 'Durability & Habits', [
        skill('mobility', 'Mobility', 'Usable range of motion in hips, ankles, shoulders, and thoracic spine.'),
        skill('core_stability', 'Core Stability', 'Trunk control and anti-rotation/anti-extension strength under load.'),
        skill('movement_symmetry', 'Movement Symmetry', 'Left/right balance and control in unilateral patterns.'),
        skill('training_discipline', 'Training Discipline', 'Consistency, preparation, and quality of training habits.'),
      ]),
    ]),
  },
  {
    sport_key: 'general_performance',
    display_name: 'General Athletic Performance',
    category: 'performance_training',
    icon: 'activity',
    positions: [],
    specialties: [
      'Multi-Sport Athleticism',
      'Youth Athletic Development',
      'Coordination & Motor Skills',
      'Speed & Conditioning',
      'Confidence Building',
      'Fitness Foundations',
    ],
    levels: ['Beginner', 'Intermediate', 'Advanced', 'Youth Development', 'High School', 'Adult'],
    assessment_template: assessmentTemplate([
      category('athleticism', 'Fundamental Athleticism', [
        skill('running_mechanics', 'Running Mechanics', 'Efficient running form: posture, arm action, and stride rhythm.'),
        skill('jumping_landing', 'Jumping & Landing', 'Safe, coordinated takeoff and landing mechanics.'),
        skill('throwing_catching', 'Throwing & Catching', 'Coordinated throwing and catching with developmentally appropriate technique.'),
        skill('coordination', 'Coordination', 'Whole-body coordination across mixed movement tasks.'),
      ]),
      category('physical_base', 'Physical Base', [
        skill('speed', 'Speed', 'Running speed appropriate to age and stage of development.'),
        skill('strength', 'Strength', 'Bodyweight and loaded strength appropriate to age and training history.'),
        skill('endurance', 'Endurance', 'Capacity to sustain activity through games and full sessions.'),
        skill('flexibility', 'Flexibility', 'Range of motion supporting safe participation across sports.'),
      ]),
      category('movement_skill', 'Movement Skill', [
        skill('balance', 'Balance', 'Static and dynamic balance through single-leg and unstable tasks.'),
        skill('body_control', 'Body Control', 'Control of the body through changes of speed, level, and direction.'),
        skill('spatial_awareness', 'Spatial Awareness', 'Awareness of space, objects, and other participants while moving.'),
      ]),
      category('mental', 'Mindset', [
        skill('confidence', 'Confidence', 'Willingness to attempt new skills and persist through difficulty.'),
        skill('focus', 'Focus', 'Attention to instructions and tasks throughout a session.'),
        skill('effort', 'Effort', 'Consistent, honest effort across activities.'),
        skill('coachability', 'Coachability', 'Receptiveness to instruction and ability to apply feedback within a session.'),
      ]),
    ]),
  },
];

export function getSport(key) {
  return SPORTS_CATALOG.find((sport) => sport.sport_key === key) || null;
}

function normalizeSportLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const EXTRA_SPORT_ALIASES = new Map([
  ['american_football', 'football'],
  ['football_american', 'football'],
  ['ice_hockey', 'hockey'],
  ['track', 'track_field'],
  ['track_and_field', 'track_field'],
  ['speed', 'speed_agility'],
  ['agility', 'speed_agility'],
  ['speed_and_agility', 'speed_agility'],
  ['speed_agility_training', 'speed_agility'],
  ['strength', 'strength_conditioning'],
  ['conditioning', 'strength_conditioning'],
  ['strength_and_conditioning', 'strength_conditioning'],
  ['general_athletic_performance', 'general_performance'],
]);

export function resolveSport(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const exact = getSport(raw) || getSport(raw.toLowerCase());
  if (exact) return exact;

  const normalized = normalizeSportLookup(raw);
  const alias = EXTRA_SPORT_ALIASES.get(normalized);
  if (alias) return getSport(alias);

  return SPORTS_CATALOG.find((sport) => {
    const keys = [
      sport.sport_key,
      sport.display_name,
      String(sport.display_name || '').replace(/\([^)]*\)/g, ''),
    ];
    return keys.some((key) => normalizeSportLookup(key) === normalized);
  }) || null;
}

export function resolveSportKey(value) {
  return resolveSport(value)?.sport_key || '';
}

export function sportOptions() {
  return SPORTS_CATALOG.map((sport) => ({ value: sport.sport_key, label: sport.display_name }));
}
