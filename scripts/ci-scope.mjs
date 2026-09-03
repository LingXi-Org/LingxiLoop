import { appendFileSync } from 'node:fs'

const image = (packageName, manifest, dockerfile, context = '.', target = '', wukongCommit = '') => ({
  package: packageName,
  manifest,
  dockerfile,
  context,
  target,
  wukong_commit: wukongCommit,
})

export function computeScope(changed = {}, manual = '') {
  const enabled = (name) => changed[name] === true
  let web
  let webImage
  let admin
  let control
  let server
  let serverSource
  let serverDocker
  let agentDocker
  let agent
  let evalHarness
  let evalRuntime
  let integration
  let openNotebook
  let wukongim
  let gateway
  let deployment
  let controlMigrations
  let release

  if (manual) {
    web = manual === 'web'
    webImage = web
    admin = control = manual === 'admin-control'
    server = ['server', 'agent-os'].includes(manual)
    serverSource = false
    serverDocker = manual === 'server'
    agentDocker = manual === 'agent-os'
    agent = manual === 'agent-os'
    evalHarness = false
    evalRuntime = agent
    integration = server
    openNotebook = manual === 'open-notebook'
    wukongim = manual === 'wukongim'
    gateway = manual === 'gateway'
    deployment = manual === 'deployment'
    controlMigrations = false
    release = manual === 'release'
  } else {
    web = enabled('web') || enabled('sharedFrontend') || enabled('testRunner')
    webImage = enabled('web') || enabled('sharedFrontend')
    admin = enabled('admin') || enabled('sharedFrontend') || enabled('testRunner')
    control = enabled('control') || enabled('sharedFrontend')
    server = enabled('server') || enabled('testRunner')
    serverSource = enabled('serverSource')
    serverDocker = enabled('serverDocker')
    agentDocker = enabled('agentDocker')
    agent = enabled('agent')
    evalHarness = enabled('evalHarness')
    evalRuntime = enabled('evalRuntime') || agent
    integration = serverSource
    openNotebook = enabled('openNotebook')
    wukongim = enabled('wukongim')
    gateway = enabled('gateway')
    deployment = enabled('deployment')
    controlMigrations = enabled('controlMigrations')
    release = enabled('release')
  }

  const images = []
  if (webImage || serverSource || serverDocker || release) {
    images.push(image('lingxiloop-server', 'server', 'server/docker/lingxiloop-server.Dockerfile'))
  }
  if (serverSource || agentDocker || release) {
    images.push(image('lingxiloop-agent-os', 'agent-os', 'server/docker/agent-os.Dockerfile'))
  }
  if (wukongim || release) {
    images.push(image(
      'lingxiloop-wukongim',
      'wukongim',
      'server/docker/wukongim.Dockerfile',
      '.',
      '',
      'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47',
    ))
  }
  if (openNotebook || release) {
    images.push(image(
      'lingxiloop-open-notebook',
      'open-notebook',
      'third_party/open-notebook/Dockerfile',
      './third_party/open-notebook',
      'lingxiloop-rag',
    ))
  }
  if (gateway || release) {
    images.push(image('lingxiloop-gateway', 'gateway', 'deploy/openship/gateway.Dockerfile'))
  }

  return {
    web,
    admin,
    control,
    server,
    eval_harness: evalHarness,
    eval_runtime: evalRuntime,
    integration,
    deploy_contract: deployment || openNotebook || release,
    control_deploy: admin || control,
    control_migrations: controlMigrations,
    release,
    checks: [web, admin, control, server, evalHarness, evalRuntime, deployment, openNotebook, release].some(Boolean),
    publish: images.length > 0,
    images,
    packages: images.map(({ manifest }) => manifest).join(' '),
  }
}

if (process.argv[1]?.endsWith('ci-scope.mjs')) {
  const enabled = (name) => process.env[name] === 'true'
  const result = computeScope({
    sharedFrontend: enabled('SHARED_FRONTEND'),
    testRunner: enabled('TEST_RUNNER'),
    web: enabled('WEB'),
    admin: enabled('ADMIN'),
    control: enabled('CONTROL'),
    server: enabled('SERVER'),
    serverSource: enabled('SERVER_SOURCE'),
    serverDocker: enabled('SERVER_DOCKER'),
    agentDocker: enabled('AGENT_DOCKER'),
    agent: enabled('AGENT'),
    evalHarness: enabled('EVAL_HARNESS'),
    evalRuntime: enabled('EVAL_RUNTIME'),
    openNotebook: enabled('OPEN_NOTEBOOK'),
    wukongim: enabled('WUKONGIM'),
    gateway: enabled('GATEWAY'),
    deployment: enabled('DEPLOYMENT'),
    controlMigrations: enabled('CONTROL_MIGRATIONS'),
    release: enabled('RELEASE'),
  }, process.env.EVENT === 'workflow_dispatch' ? process.env.MANUAL_SCOPE : '')
  const lines = Object.entries(result).map(([name, value]) => {
    if (name === 'images') return `images=${JSON.stringify({ include: value })}`
    return `${name}=${value}`
  })
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}
