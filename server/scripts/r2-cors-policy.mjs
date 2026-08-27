export const DEFAULT_R2_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5180',
  'app://lingxiloop',
]

export function uniqueOrigins(extraOrigins = []) {
  return [...new Set([
    ...DEFAULT_R2_CORS_ORIGINS,
    ...extraOrigins.map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean),
  ])]
}

export function buildR2CorsRules(origins) {
  return [
    {
      AllowedOrigins: origins,
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ]
}

function ruleAllowsHeader(rule, header) {
  const allowed = (rule.AllowedHeaders ?? []).map((value) => value.toLowerCase())
  return allowed.includes('*') || allowed.includes(header.toLowerCase())
}

/** Return actionable errors when a read-back policy cannot serve presigned PUTs. */
export function validateR2CorsRules(rules, requiredOrigins) {
  const errors = []
  for (const origin of requiredOrigins) {
    const compatible = (rules ?? []).some((rule) =>
      (rule.AllowedOrigins ?? []).includes(origin) &&
      (rule.AllowedMethods ?? []).some((method) => method.toUpperCase() === 'PUT') &&
      ruleAllowsHeader(rule, 'content-type'))
    if (!compatible) errors.push(`missing presigned PUT permission for origin ${origin}`)
  }
  return errors
}

export function assertR2CorsRules(rules, requiredOrigins) {
  const errors = validateR2CorsRules(rules, requiredOrigins)
  if (errors.length > 0) throw new Error(`R2 CORS readback verification failed: ${errors.join('; ')}`)
}
