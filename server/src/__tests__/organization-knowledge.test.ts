import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const application = readFileSync(new URL('../modules/knowledge/organization-application.ts', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../modules/knowledge/organization-repository.ts', import.meta.url), 'utf8')
const knowledgeRepository = readFileSync(new URL('../modules/knowledge/repository.ts', import.meta.url), 'utf8')
const retrievalRepository = readFileSync(new URL('../modules/knowledge/retrieval-repository.ts', import.meta.url), 'utf8')
const agentRepository = readFileSync(new URL('../modules/knowledge/agent-repository.ts', import.meta.url), 'utf8')
const agentApplication = readFileSync(new URL('../modules/knowledge/agent-application.ts', import.meta.url), 'utf8')
const ingestionRepository = readFileSync(new URL('../modules/knowledge/ingestion-repository.ts', import.meta.url), 'utf8')
const router = readFileSync(new URL('../modules/knowledge/router.ts', import.meta.url), 'utf8')

test('Organization Knowledge promotes one ready Institutional Course source without copying content', () => {
  assert.match(repository, /company\.type='EDUCATION'/)
  assert.match(repository, /source\.status='ready'/)
  assert.match(repository, /origin\.kind='INSTITUTIONAL_COURSE'/)
  assert.match(repository, /INSERT INTO knowledge_source_bindings/)
  assert.doesNotMatch(repository, /INSERT INTO knowledge_sources|knowledge_source_jobs|learning_states|learning_attempts/)
  assert.match(application, /action: 'company:update'/)
  assert.match(application, /ORGANIZATION_KNOWLEDGE\.PROMOTED/)
})

test('Course Knowledge explicitly binds promoted sources to another active Institutional Course', () => {
  assert.match(repository, /organization\.scope_type='ORGANIZATION'/)
  assert.match(repository, /target\.kind='INSTITUTIONAL_COURSE'/)
  assert.match(repository, /target\.status IN \('DRAFT','ACTIVE'\)/)
  assert.match(repository, /target\.id<>source\.project_id/)
  assert.match(application, /action: 'knowledge:manage'/)
  assert.match(application, /COURSE_KNOWLEDGE\.ATTACHED/)
  assert.match(router, /\.put\('\/organization-knowledge\/sources\/:sourceId'/)
  assert.match(router, /\.put\('\/projects\/:id\/organization-knowledge\/:sourceId'/)
})

test('attached Course Knowledge is readable everywhere without granting source mutation ownership', () => {
  for (const module of [knowledgeRepository, retrievalRepository, agentRepository, ingestionRepository]) {
    assert.match(module, /knowledge_source_bindings/)
    assert.match(module, /scope_type='COURSE'/)
  }
  for (const mutation of [
    /UPDATE knowledge_sources SET title=COALESCE\(\$4,title\),updated_at=NOW\(\)[\s\S]*company_id=\$2 AND project_id=\$3/,
    /UPDATE knowledge_sources SET deleted_at=NOW\(\),updated_at=NOW\(\)[\s\S]*company_id=\$2 AND project_id=\$3/,
  ]) assert.match(agentRepository, mutation)
  assert.match(ingestionRepository, /softDeleteTenantSource[\s\S]*project_id=\$3/)
  assert.match(agentApplication, /createKnowledgeInsight[\s\S]*resolveOwnedSource/)
  assert.match(agentApplication, /updateKnowledgeSourceForAgent[\s\S]*resolveOwnedSource/)
  assert.match(agentApplication, /unlinkKnowledgeSourceForAgent[\s\S]*findOwnedAgentSource/)
})
