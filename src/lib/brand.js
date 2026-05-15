// Brand identity adapts to the area of the site the user is in:
//   - LC TRAINING : private training / booking flow
//   - LCFC        : competitive club / UPSL team
//   - LES CHÈVRES : default umbrella brand (home, about, apply, blog, etc.)
export function getBrandLabel(pathname = '') {
  if (
    pathname.includes('/book') ||
    pathname.includes('/booking') ||
    pathname.includes('/sessions') ||
    pathname.includes('/training')
  ) {
    return 'LC TRAINING';
  }

  if (
    pathname.includes('/team') ||
    pathname.includes('/upsl') ||
    pathname.includes('/roster') ||
    pathname.includes('/club')
  ) {
    return 'LCFC';
  }

  return 'LES CHÈVRES';
}
