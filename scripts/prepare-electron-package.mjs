#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const stage = new URL('../electron-package/', import.meta.url)
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

for (const directory of ['dist', 'electron']) {
  cpSync(new URL(`../${directory}/`, import.meta.url), new URL(`../electron-package/${directory}/`, import.meta.url), { recursive: true })
}
mkdirSync(new URL('../electron-package/build/', import.meta.url), { recursive: true })
for (const file of [
  'icon.png',
  'tray-template.png',
  'tray-template@2x.png',
  'tray-template@3x.png',
  'tray-template-unread.png',
  'tray-template-unread@2x.png',
  'tray-template-unread@3x.png',
]) {
  cpSync(new URL(`../build/${file}`, import.meta.url), new URL(`../electron-package/build/${file}`, import.meta.url))
}

const runtimeModules = [
  'argparse',
  'builder-util-runtime',
  'debug',
  'electron-updater',
  'fs-extra',
  'graceful-fs',
  'js-yaml',
  'jsonfile',
  'lazy-val',
  'lodash.escaperegexp',
  'lodash.isequal',
  'ms',
  'sax',
  'semver',
  'tiny-typed-emitter',
  'universalify',
]
mkdirSync(new URL('../electron-package/node_modules/', import.meta.url), { recursive: true })
for (const moduleName of runtimeModules) {
  const destination = new URL(`../electron-package/node_modules/${moduleName}/`, import.meta.url)
  cpSync(new URL(`../node_modules/${moduleName}/`, import.meta.url), destination, { recursive: true })
}

const stagedPackage = {
  name: 'lingxiloop',
  private: true,
  version: rootPackage.version,
  description: rootPackage.description,
  author: rootPackage.author,
  license: rootPackage.license,
  main: 'electron/main.cjs',
  dependencies: { 'electron-updater': rootPackage.dependencies['electron-updater'] },
}
writeFileSync(new URL('../electron-package/package.json', import.meta.url), `${JSON.stringify(stagedPackage, null, 2)}\n`)
console.log(`Prepared minimal Electron app: ${runtimeModules.length} runtime modules, version ${rootPackage.version}`)
