#!/usr/bin/env node
// Derive install-only manifests from the exact root lock, without registry resolution.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'))
const json = value => `${JSON.stringify(value, null, 2)}\n`

export function lockedClosure(lock, manifest) {
  const selected = new Set()
  const resolvePackage = (name, from) => {
    let directory = from
    while (true) {
      const candidate = `${directory ? `${directory}/` : ''}node_modules/${name}`
      if (lock.packages[candidate]) return candidate
      if (!directory) return undefined
      const at = directory.lastIndexOf('/node_modules/')
      directory = at < 0 ? '' : directory.slice(0, at)
    }
  }
  function visit(name, from, optional = false) {
    const key = resolvePackage(name, from)
    if (!key) {
      if (optional) return
      throw new Error(`Missing locked dependency ${name} from ${from || '<root>'}`)
    }
    if (selected.has(key)) return
    selected.add(key)
    const entry = lock.packages[key]
    for (const dependency of Object.keys(entry.dependencies || {})) {
      visit(dependency, key, Object.hasOwn(entry.optionalDependencies || {}, dependency))
    }
    for (const dependency of Object.keys(entry.optionalDependencies || {})) visit(dependency, key, true)
    for (const dependency of Object.keys(entry.peerDependencies || {})) {
      visit(dependency, key, Boolean(entry.peerDependenciesMeta?.[dependency]?.optional))
    }
  }
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) visit(name, '')
  return {
    name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
    packages: { '': manifest, ...Object.fromEntries([...selected].sort().map(key => [key, lock.packages[key]])) },
  }
}

export function generateProfiles() {
  const full = read('package.json')
  const lock = read('package-lock.json')
  const server = read('server/package.json')
  // Runtime stylesheet vendored from the locked shadcn CLI; see its adjacent provenance.
  if (lock.packages['node_modules/shadcn']?.version !== '4.19.0' ||
      createHash('sha256').update(readFileSync(resolve(root, 'src/styles/vendor/shadcn/tailwind.css'))).digest('hex') !== 'bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a') {
    throw new Error('Requalify the vendored shadcn runtime stylesheet after a CLI/CSS change')
  }
  // These root-only consumers are backend services or the separate admin surface.
  // Keep uncertain/shared consumers; LingxiOS' own transitive runtime stays intact.
  const excludedWeb = new Set([
    '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@openplait/core', '@opentelemetry/api',
    '@refinedev/core', '@refinedev/react-router', 'compression', 'dotenv', 'drizzle-orm',
    'express', 'hono', 'ioredis', 'officeparser', 'openai', 'openlit', 'pg', 'react-router', 'ws',
  ])
  const pick = names => Object.fromEntries(names.map(name => {
    const version = full.dependencies[name] || full.devDependencies[name]
    if (!version) throw new Error(`Unknown root dependency ${name}`)
    return [name, version]
  }))
  const tools = ['@biomejs/biome', '@types/prismjs', '@types/react', '@types/react-dom', '@vitejs/plugin-react',
    '@tailwindcss/typography', 'esbuild', 'postcss', 'tailwind-scrollbar-hide', 'tailwindcss', 'typescript', 'vite', 'vitest']
  const profiles = {
    web: { dependencies: Object.fromEntries(Object.entries(full.dependencies).filter(([name]) => !excludedWeb.has(name))), devDependencies: pick(tools) },
    'server-ci': { dependencies: { ...server.dependencies, ...pick(['@assistant-ui/react', '@tiptap/y-tiptap']) },
      devDependencies: pick(['@biomejs/biome', 'typescript', 'vitest', '@types/react', '@types/react-dom', '@types/compression', '@types/express', '@types/pg', '@types/ws']) },
    'deploy-contract': { dependencies: pick(['@lyyzka/lingxios', 'pg']), devDependencies: pick(['typescript']) },
  }
  profiles['web-ci'] = { ...profiles.web, dependencies: { ...profiles.web.dependencies, ...pick(['dotenv', 'pg', 'ioredis']) } }
  profiles.admin = { ...profiles.web, dependencies: { ...profiles.web.dependencies, ...pick(['@refinedev/core', '@refinedev/react-router', 'react-router', '@openplait/core']) } }
  profiles.control = { dependencies: pick(['hono', 'better-auth', 'drizzle-orm', '@modelcontextprotocol/sdk', 'zod']), devDependencies: pick(['@biomejs/biome', '@cloudflare/vitest-pool-workers', 'typescript', 'vitest', 'wrangler']) }
  profiles.integration = { ...profiles['server-ci'], dependencies: { ...profiles['server-ci'].dependencies, ...pick(['@modelcontextprotocol/ext-apps', 'esbuild', 'html-to-image']) } }
  profiles['admin-control'] = { dependencies: { ...profiles.admin.dependencies, ...profiles.control.dependencies }, devDependencies: { ...profiles.admin.devDependencies, ...profiles.control.devDependencies } }
  return Object.entries(profiles).flatMap(([scope, dependencies]) => {
    const manifest = { name: `lingxiloop-${scope}-dependencies`, version: full.version, private: true, ...dependencies }
    return [[`server/build/${scope}/package.json`, json(manifest)], [`server/build/${scope}/package-lock.json`, json(lockedClosure(lock, manifest))]]
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write')
  for (const [file, content] of generateProfiles()) {
    if (write) {
      mkdirSync(dirname(resolve(root, file)), { recursive: true })
      writeFileSync(resolve(root, file), content)
    } else if (readFileSync(resolve(root, file), 'utf8') !== content) {
      throw new Error(`${file} drifted; run node server/scripts/scoped-dependencies.mjs --write`)
    }
  }
  console.log(`Scoped dependency profiles ${write ? 'generated' : 'match root lock'}`)
}
