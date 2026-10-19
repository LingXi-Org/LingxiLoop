import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
const output=process.env.E2E_VISUALIZE_LIVE_OUTPUT??'.e2e/visualize-live'
const child=spawn(process.execPath,['node_modules/e2e/dist/cli/bin.js','run','--config','e2e.visualize-live.config.ts','--output',output],{stdio:'inherit',env:{...process.env,E2E_TELEMETRY_DISABLED:'1'}})
child.once('error',error=>{console.error(error.message);process.exitCode=1})
child.once('exit',code=>{console.log(JSON.stringify({browserReport:resolve(output,'report.json'),interactionEvidence:resolve(output,'live-interaction.json'),exitCode:code}));process.exitCode=code??1})
