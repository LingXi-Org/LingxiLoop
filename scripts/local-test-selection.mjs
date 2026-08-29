const schemaTests = new Map([
  ['server/src/db/schema.sql', 'server/src/__tests__/schema-v1.test.ts'],
  ['server/src/db/bootstrap.ts', 'server/src/__tests__/schema-v1.test.ts'],
])

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

export function selectLocalTests(allTests, taskPaths, explicitTests = []) {
  const available = new Set(allTests.map(normalizePath))
  const selected = new Set()
  const add = (path) => {
    const normalized = normalizePath(path)
    if (available.has(normalized)) selected.add(normalized)
  }

  for (const path of explicitTests) add(path)
  for (const rawPath of taskPaths) {
    const path = normalizePath(rawPath)
    if (path.endsWith('.test.ts')) add(path)
    const schemaTest = schemaTests.get(path)
    if (schemaTest) add(schemaTest)
    if (/\.[cm]?[jt]sx?$/.test(path) && !path.endsWith('.test.ts')) {
      add(path.replace(/\.[cm]?[jt]sx?$/, '.test.ts'))
    }
  }

  return [...selected].sort((a, b) => a.localeCompare(b, 'en'))
}
