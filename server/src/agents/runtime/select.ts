/**
 * Pick which `AgentRuntimeClient` impl this process uses.
 *
 * Default: `inprocClient` — direct DB / Redis access. What the lingxiloop
 * server has always done, what the in-process scheduler still does.
 *
 * When `LINGXILOOP_RUNTIME_CLIENT=http` is set, switch to `HttpRuntimeClient`
 * pointed at the lingxiloop server. This is the mode the per-agent pod
 * runs in: it has no DB credentials, only a JWT and a URL.
 *
 * Required env in http mode:
 *   - LINGXILOOP_AGENT_RUNTIME_URL    e.g. http://host.docker.internal:5181
 *   - LINGXILOOP_AGENT_RUNTIME_TOKEN  signed via runtime/jwt.ts
 */
import type { AgentRuntimeClient } from './client.js'
import { HttpRuntimeClient } from './http-client.js'
import { inprocClient } from './inproc-client.js'

function pick(): AgentRuntimeClient {
  if (process.env.LINGXILOOP_RUNTIME_CLIENT === 'http') {
    const baseUrl = process.env.LINGXILOOP_AGENT_RUNTIME_URL
    const token = process.env.LINGXILOOP_AGENT_RUNTIME_TOKEN
    if (!baseUrl || !token) {
      throw new Error('LINGXILOOP_RUNTIME_CLIENT=http requires LINGXILOOP_AGENT_RUNTIME_URL + LINGXILOOP_AGENT_RUNTIME_TOKEN')
    }
    return new HttpRuntimeClient({ baseUrl, token })
  }
  return inprocClient
}

export const runtime: AgentRuntimeClient = pick()
