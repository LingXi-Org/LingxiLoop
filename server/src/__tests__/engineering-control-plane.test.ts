import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ENGINEERING_L4_SOURCES,
  engineeringControlPlaneIdentitySchema,
  engineeringL4ReadRequestSchema,
} from '../engineering-control-plane/public.js'

const port = readFileSync(new URL('../engineering-control-plane/port.ts', import.meta.url), 'utf8')
const apiRouter = readFileSync(new URL('../api/router.ts', import.meta.url), 'utf8')

test('Engineering Control Plane port covers all canonical L4 authorities with bounded pages', () => {
  assert.deepEqual(ENGINEERING_L4_SOURCES, [
    'AGENT_RUN', 'TOOL_CALL', 'RAG_TRACE', 'LLM_LEDGER', 'EVAL', 'SAFETY', 'METRIC', 'LOG',
  ])
  assert.equal(engineeringL4ReadRequestSchema.safeParse({ sources: ['AGENT_RUN'], limit: 100 }).success, true)
  assert.equal(engineeringL4ReadRequestSchema.safeParse({ sources: ['AGENT_RUN'], limit: 101 }).success, false)
  assert.equal(engineeringL4ReadRequestSchema.safeParse({ sources: [], limit: 1 }).success, false)
  assert.equal(engineeringControlPlaneIdentitySchema.safeParse({
    audience: 'ENGINEERING_CONTROL_PLANE', deploymentId: 'engineering-prod',
  }).success, true)
})

test('L4 access has no product identity, Role, Permission, frontend, or HTTP route', () => {
  assert.match(port, /interface EngineeringControlPlanePort/)
  assert.doesNotMatch(port, /actorUserId|CompanyRole|ProjectRole|PermissionAction|createPermissionService/)
  assert.doesNotMatch(apiRouter, /engineering-control-plane|engineering\/l4|EngineeringControlPlane/)
})
