const RAW_PLACES = [
  ['Detroit, MI', 'city', 42.3314, -83.0458, ['wayne', 'downtown detroit', 'midtown detroit', '48226']],
  ['Royal Oak, MI', 'city', 42.4895, -83.1446, ['oakland', '48067', '48073']],
  ['Rochester Hills, MI', 'city', 42.6584, -83.1499, ['oakland', 'rochester hills', '48307', '48309']],
  ['Rochester, MI', 'city', 42.6806, -83.1338, ['oakland', '48307']],
  ['Sterling Heights, MI', 'city', 42.5803, -83.0302, ['macomb', '48310', '48312', '48313']],
  ['Troy, MI', 'city', 42.6064, -83.1498, ['oakland', '48083', '48084', '48085']],
  ['Novi, MI', 'city', 42.4806, -83.4755, ['oakland', '48375', '48377']],
  ['Southfield, MI', 'city', 42.4734, -83.2219, ['oakland', '48033', '48034', '48075']],
  ['Farmington Hills, MI', 'city', 42.4989, -83.3677, ['oakland', '48331', '48334', '48335']],
  ['Dearborn, MI', 'city', 42.3223, -83.1763, ['wayne', '48124', '48126']],
  ['Warren, MI', 'city', 42.5145, -83.0147, ['macomb', '48088', '48089', '48091', '48093']],
  ['Livonia, MI', 'city', 42.3684, -83.3527, ['wayne', '48150', '48152', '48154']],
  ['Birmingham, MI', 'city', 42.5467, -83.2113, ['oakland', '48009']],
  ['Macomb, MI', 'city', 42.7009, -82.9594, ['macomb township', 'macomb county', '48042']],
  ['Canton, MI', 'city', 42.3086, -83.4822, ['wayne', '48187', '48188']],
  ['Oakland County, MI', 'county', 42.6603, -83.3850, ['oakland']],
  ['Macomb County, MI', 'county', 42.6759, -82.7779, ['macomb']],
  ['Wayne County, MI', 'county', 42.2791, -83.3362, ['wayne']],
  ['Metro Detroit, MI', 'region', 42.4650, -83.1000, ['detroit metro', 'southeast michigan']],
];

export const METRO_DETROIT_PLACES = RAW_PLACES.map((entry) => {
  const [label, type, lat, lng, aliases] =
    /** @type {[string, string, number, number, string[]]} */ (entry);
  return {
    label,
    type,
    lat,
    lng,
    aliases,
    searchText: [label, type, ...(aliases || [])].join(' ').toLowerCase(),
  };
});

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bmichigan\b/g, 'mi')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericCoord(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function placeFromParams(params) {
  const label = params.get('location') || params.get('location_label') || '';
  const lat = numericCoord(params.get('lat') || params.get('location_lat'));
  const lng = numericCoord(params.get('lng') || params.get('location_lng'));
  if (label && lat !== null && lng !== null) {
    return { label, lat, lng, type: 'custom' };
  }
  return resolvePlace(label);
}

export function findPlaceSuggestions(query, limit = 6) {
  const term = normalize(query);
  if (!term) return [];

  return METRO_DETROIT_PLACES
    .map((place) => {
      const label = normalize(place.label);
      const searchText = normalize(place.searchText);
      let score = 0;
      if (label === term) score += 100;
      if (label.startsWith(term)) score += 80;
      if (searchText.includes(term)) score += 40;
      if (place.aliases?.some((alias) => normalize(alias).startsWith(term))) score += 30;
      return { place, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.place.label.localeCompare(b.place.label))
    .slice(0, limit)
    .map((item) => item.place);
}

export function resolvePlace(value) {
  if (!value) return null;
  const exact = normalize(value);
  const embedded = METRO_DETROIT_PLACES
    .map((place) => {
      const terms = [
        normalize(place.label).replace(/\bmi\b/g, '').trim(),
        ...(place.aliases || []).map((alias) => normalize(alias)),
      ].filter(Boolean);
      const match = terms
        .filter((term) => exact.includes(term))
        .sort((a, b) => b.length - a.length)[0];
      return { place, matchLength: match?.length || 0 };
    })
    .filter((item) => item.matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength)[0]?.place;
  return METRO_DETROIT_PLACES.find((place) => (
    normalize(place.label) === exact
    || place.aliases?.some((alias) => normalize(alias) === exact)
  ))
    || embedded
    || findPlaceSuggestions(value, 1)[0]
    || null;
}

export function placeParts(placeOrLabel) {
  const label = typeof placeOrLabel === 'string' ? placeOrLabel : placeOrLabel?.label;
  const [city = '', state = 'MI'] = String(label || '').split(',').map((part) => part.trim());
  return {
    city,
    state: state || 'MI',
  };
}

export function countyForPlace(placeOrLabel) {
  const place = typeof placeOrLabel === 'string' ? resolvePlace(placeOrLabel) : placeOrLabel;
  const text = normalize([
    place?.label,
    ...(place?.aliases || []),
  ].filter(Boolean).join(' '));
  if (text.includes('oakland')) return 'Oakland';
  if (text.includes('macomb')) return 'Macomb';
  if (text.includes('wayne')) return 'Wayne';
  return '';
}

export function distanceMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = numericCoord(a.lat);
  const lng1 = numericCoord(a.lng);
  const lat2 = numericCoord(b.lat);
  const lng2 = numericCoord(b.lng);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;

  const toRad = (deg) => deg * (Math.PI / 180);
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function coachCoordinates(coach) {
  const directLat = numericCoord(coach?.location_lat ?? coach?.lat ?? coach?.latitude);
  const directLng = numericCoord(coach?.location_lng ?? coach?.lng ?? coach?.longitude);
  if (directLat !== null && directLng !== null) {
    return {
      label: coach?.service_area_label
        || coach?.training_area
        || [coach?.service_city, coach?.service_state].filter(Boolean).join(', ')
        || coach?.city
        || coach?.county
        || 'Coach location',
      lat: directLat,
      lng: directLng,
    };
  }

  const locationFields = [
    coach?.service_area_label,
    coach?.service_city ? [coach.service_city, coach?.service_state || 'MI'].filter(Boolean).join(', ') : '',
    coach?.service_zip,
    coach?.training_area,
    coach?.city,
    coach?.location,
    coach?.county ? `${coach.county} County, MI` : '',
  ].filter(Boolean);

  for (const field of locationFields) {
    const place = resolvePlace(field);
    if (place) return place;
  }

  return null;
}

export function coachDistanceMiles(coach, place) {
  const coords = coachCoordinates(coach);
  const target = numericCoord(place?.lat) !== null && numericCoord(place?.lng) !== null
    ? place
    : resolvePlace(place?.label || place);
  return distanceMiles(coords, target);
}

export function coachServiceRadiusMiles(coach) {
  const radius = Number(
    coach?.service_radius_miles
    ?? coach?.training_radius_miles
    ?? coach?.radius_miles,
  );
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

export function coachWithinRadius(coach, place, radiusMiles = 15) {
  const distance = coachDistanceMiles(coach, place);
  if (distance === null) return true;
  return distance <= Number(radiusMiles || 15);
}
