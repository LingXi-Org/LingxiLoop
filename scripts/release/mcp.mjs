#!/usr/bin/env node
// Dependency-free MCP stdio transport. All tools call the same versioned API as
// CI/CLI; no local shell, production credentials or model orchestration API.
import { createInterface } from 'node:readline'
import { callRelease } from './client.mjs'
const names = ['plan', 'submit', 'get', 'watch', 'resume', 'recover', 'accepted']
const tools = names.map(name => ({ name: `release_${name}`, description: `LingxiLoop release ${name}; returns durable structured state`, inputSchema: {
  type: 'object', properties: { manifest: { type: 'object' }, releaseId: { type: 'string' }, after: { type: 'integer', minimum: 0 } },
  required: ['plan', 'submit'].includes(name) ? ['manifest'] : name === 'accepted' ? [] : ['releaseId'], additionalProperties: false,
} }))
const reader = createInterface({ input: process.stdin })
for await (const line of reader) {
  let request
  try {
    request = JSON.parse(line)
    if (request.id === undefined) continue
    let result
    if (request.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'lingxiloop-release', version: '1.0.0' } }
    else if (request.method === 'ping') result = {}
    else if (request.method === 'tools/list') result = { tools }
    else if (request.method === 'tools/call') {
      const name = request.params?.name?.replace(/^release_/, '')
      if (!names.includes(name)) throw new Error('UNKNOWN_RELEASE_METHOD')
      const data = await callRelease(name, request.params.arguments)
      result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }
    } else throw new Error('METHOD_NOT_FOUND')
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
  } catch (error) {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'RELEASE_TOOL_FAILED' } }))
  }
}
