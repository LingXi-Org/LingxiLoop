import assert from 'node:assert/strict'
import test from 'node:test'
import { displayMentionText, scanVisibleMentions, parseMentions } from './mentions'
import { isChineseAgentName, participantDisplayName, participantMentionNames, presentParticipant } from './participantDisplayName'

const roster = ['nova','sage','milo','trace','scout','forge'].map(id => ({ id, name: id, kind: 'agent' as const, presetKey: id }))
test('six presets, aliases, quotes and table exports use Chinese while stable IDs remain parseable', () => {
  const source = '@nova @sage @milo @trace @scout @forge\n> @sage\n| @milo | 核对 |'
  assert.equal(displayMentionText(source,roster), '@司南 @明理 @砺思 @溯源 @寻知 @成器\n> @明理\n| @砺思 | 核对 |')
  assert.deepEqual(parseMentions(source,roster).mentionedIds,roster.map(p => p.id))
  assert.equal(displayMentionText('a@sage.cn https://example.test/@sage `print("@sage")`',roster), 'a@sage.cn https://example.test/@sage `print("@sage")`')
  assert.equal(displayMentionText('| 成员 ID | 分工 |\n| --- | --- |\n| sage | 核对 |',roster), '| 成员 | 分工 |\n| --- | --- |\n| @明理 | 核对 |')
})
test('partial and unknown English handles have no guessed recipient and never flash a raw handle', () => {
  for (const text of ['@s','@sag','@sagee','@missing']) {
    assert.equal(displayMentionText(text,roster), '@未识别成员')
    assert.deepEqual(parseMentions(text,roster).mentionedIds,[])
    assert.equal(scanVisibleMentions(text,roster)[0].id,undefined)
    assert.equal(displayMentionText('`'+text+'`',roster),'`@未识别成员`')
  }
})
test('renames resolve historical preset aliases; duplicate Chinese names stay ambiguous', () => {
  const renamed = [{...roster[1],id:'tenant-sage',name:'新明理'}]
  assert.equal(displayMentionText('@sage @tenant-sage',renamed),'@新明理 @新明理')
  assert.deepEqual(parseMentions('@新明理',[...renamed,{id:'other',name:'新明理',kind:'agent'}]).mentionedIds,[])
})
test('legacy custom agents use an explicit unset label; human names and IDs remain intact', () => {
  const old = {id:'custom-id',kind:'agent' as const,name:'Custom Helper'}
  const projected = presentParticipant(old)
  assert.equal(projected.name,'智能助教')
  assert.equal(projected.sourceName,'Custom Helper')
  assert.equal(projected.id,old.id)
  assert.equal(displayMentionText('@custom-id',[projected]),'@智能助教')
  assert.deepEqual(parseMentions('@智能助教',[projected]).mentionedIds,[],'a fallback label is never a dispatch alias')
  assert.ok(!participantMentionNames(projected).includes('智能助教'))
  assert.equal(participantDisplayName({kind:'human',name:'Alice'}),'Alice')
  for (const name of ['明理','新明理','司南']) assert.equal(isChineseAgentName(name),true)
  for (const name of ['Nova','明理English','智能体1','', '明 理']) assert.equal(isChineseAgentName(name),false)
})
