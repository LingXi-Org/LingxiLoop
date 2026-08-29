import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const componentUrl = (name: string) => new URL(`../features/learning/components/${name}`, import.meta.url)
const read = (name: string) => readFileSync(componentUrl(name), 'utf8')

test('Learning Center is a thin shell over bounded feature sections', () => {
  const shell = read('LearningCenter.tsx')
  const sections = [
    'LearningTodaySection.tsx',
    'LearningObjectivesSection.tsx',
    'LearningActivitiesSection.tsx',
    'LearningEvidenceSection.tsx',
    'LearningReviewsSection.tsx',
    'LearningNotificationsSection.tsx',
  ]

  assert.ok(shell.split('\n').length < 150)
  assert.doesNotMatch(shell, /learningApi|useApp|useParticipants|useConversations/)
  for (const section of sections) {
    const source = read(section)
    assert.match(shell, new RegExp(section.replace('.tsx', '')))
    assert.ok(source.split('\n').length < 250, `${section} must keep one bounded section owner`)
  }
})

test('Learning feature composes official primitives without native equivalents', () => {
  const names = [
    'LearningCenter.tsx',
    'LearningCenterHeader.tsx',
    'LearningSetup.tsx',
    'LearningTodaySection.tsx',
    'LearningObjectivesSection.tsx',
    'LearningActivitiesSection.tsx',
    'LearningEvidenceSection.tsx',
    'LearningReviewsSection.tsx',
    'LearningNotificationsSection.tsx',
    'learningDisplay.tsx',
  ]
  const source = names.map(read).join('\n')

  assert.equal(existsSync(componentUrl('LearningPrimitives.tsx')), false)
  assert.doesNotMatch(source, /<(?:button|select)\b|<input\b[^>]*type=['"]checkbox['"]/)
  assert.doesNotMatch(source, /\b(?:bg-app|bg-panel|bg-raised|text-ink|border-hairline)\b/)
  assert.match(source, /@\/components\/ui\/card/)
  assert.match(source, /@\/components\/ui\/button/)
  assert.match(source, /@\/components\/ui\/select/)
  assert.match(source, /@\/components\/ui\/checkbox/)
})
