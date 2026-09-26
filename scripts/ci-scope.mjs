import { appendFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'

const image = (packageName, manifest, dockerfile, context = '.', target = '', wukongCommit = '') => ({
  package: packageName, manifest, dockerfile, context, target, wukong_commit: wukongCommit,
})

export function computeScope(changed = {}, manual = '') {
  if (manual) {
    if (!['web', 'admin-control', 'server', 'open-notebook', 'wukongim', 'gateway', 'deployment', 'release', 'deep-integration'].includes(manual)) {
      throw new Error(`unknown CI scope: ${manual}`)
    }
    changed = {
      web: manual === 'web',
      admin: manual === 'admin-control',
      control: manual === 'admin-control',
      serverSource: manual === 'server',
      openNotebook: manual === 'open-notebook',
      wukongim: manual === 'wukongim',
      gateway: manual === 'gateway',
      deployment: manual === 'deployment',
      release: manual === 'release',
    }
  }
  const enabled = (name) => changed[name] === true
  const release = enabled('release')
  const shared = enabled('sharedFrontend')
  const lintConfig = enabled('lintConfig')
  const runner = enabled('testRunner')
  const webBuild = enabled('web') || shared || release
  const adminBuild = enabled('admin') || shared
  const web = webBuild || enabled('webTests') || runner || lintConfig
  const admin = adminBuild || enabled('adminTests') || runner || lintConfig
  const controlSource = enabled('control') || shared
  const control = controlSource || enabled('controlTests') || lintConfig
  const serverSource = enabled('serverSource') || shared || release
  const server = serverSource || enabled('server') || enabled('serverTests') || runner || lintConfig
  const deepIntegration = manual === 'deep-integration'
  const fullIntegration = serverSource || enabled('integrationRunner') || deepIntegration
  const integration = fullIntegration || enabled('integrationTests')
  const integrationFiles = fullIntegration ? [] : (changed.integrationFiles ?? [])
    .filter((file) => /^server\/src\/__integration__\/[^/]+\.test\.ts$/.test(file) && existsSync(file))
    .map((file) => basename(file))
  const openNotebook = enabled('openNotebook') || enabled('openNotebookTests') || release
  const deployment = enabled('deployment')
  const deployContract = deployment || enabled('ci') || enabled('serverDocker') || enabled('wukongim') || enabled('gateway') || openNotebook || release
  const checkJobs = []
  if (web) checkJobs.push({ component: 'web' })
  if (admin) checkJobs.push({ component: 'admin' })
  if (control) checkJobs.push({ component: 'control' })
  if (server) checkJobs.push({ component: 'server' })
  if (openNotebook) checkJobs.push({ component: 'open-notebook' })
  if (deployContract) checkJobs.push({ component: 'deploy-contract' })
  if (release) checkJobs.push({ component: 'release' })

  const images = []
  if (webBuild || serverSource || enabled('serverDocker')) {
    images.push(image('lingxiloop-server', 'server', 'server/docker/lingxiloop-server.Dockerfile'))
  }
  if (enabled('wukongim') || release) {
    images.push(image(
      'lingxiloop-wukongim', 'wukongim', 'server/docker/wukongim.Dockerfile', '.', '',
      'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47',
    ))
  }
  if (enabled('openNotebook') || release) {
    images.push(image(
      'lingxiloop-open-notebook', 'open-notebook', 'third_party/open-notebook/Dockerfile',
      './third_party/open-notebook', 'lingxiloop-rag',
    ))
  }
  if (enabled('gateway') || release) {
    images.push(image('lingxiloop-gateway', 'gateway', 'deploy/komodo/lingxiloop-app-b/gateway.Dockerfile'))
  }

  return {
    web, web_build: webBuild,
    admin, admin_build: adminBuild,
    control, server, integration,
    integration_files: integrationFiles,
    deep_integration: deepIntegration,
    open_notebook: openNotebook,
    deployment,
    deploy_contract: deployContract,
    control_deploy: adminBuild || controlSource,
    control_migrations: enabled('controlMigrations'),
    release,
    checks: [web, admin, control, server, deployContract].some(Boolean),
    check_jobs: checkJobs,
    publish: images.length > 0,
    images,
    packages: images.map(({ manifest }) => manifest).join(' '),
  }
}

if (process.argv[1]?.endsWith('ci-scope.mjs')) {
  const changed = Object.fromEntries([
    'sharedFrontend', 'lintConfig', 'testRunner', 'web', 'webTests', 'admin', 'adminTests',
    'control', 'controlTests', 'server', 'serverTests', 'serverSource', 'serverDocker',
    'integrationRunner', 'integrationTests', 'openNotebook', 'openNotebookTests',
    'wukongim', 'gateway', 'deployment', 'controlMigrations', 'release',
  ].map((name) => [name, process.env[name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()] === 'true']))
  changed.ci = process.env.CI_CONFIG === 'true'
  changed.integrationFiles = JSON.parse(process.env.INTEGRATION_FILES || '[]')
  const result = computeScope(changed, process.env.EVENT === 'workflow_dispatch' ? process.env.MANUAL_SCOPE : '')
  const lines = Object.entries(result).map(([name, value]) => {
    if (name === 'images' || name === 'check_jobs') return `${name}=${JSON.stringify({ include: value })}`
    return `${name}=${Array.isArray(value) ? JSON.stringify(value) : value}`
  })
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}
