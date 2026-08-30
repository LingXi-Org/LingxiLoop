const DICEBEAR_PLANETS_URL = 'https://api.dicebear.com/10.x/planets/svg'

export function getCourseAvatarUrl(courseId: string): string {
  const seed = courseId.trim() || 'Felix'
  return `${DICEBEAR_PLANETS_URL}?planetColor=e27a8c,e37f64,d88a40,c1982a,d67cb2&seed=${encodeURIComponent(seed)}`
}
