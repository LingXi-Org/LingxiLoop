import { useMemo, useState, type FormEvent } from 'react'
import { useAuiState } from '@assistant-ui/react'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { sendUserMessage, useMessages } from '@/features/chat/state/messages'
import { useMe } from '@/stores/auth'
import type { Message, QuestionnaireItemPayload } from '@/types'
import { Questionnaire } from '@shadcn/react/questionnaire'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const EMPTY_MESSAGES: readonly Message[] = []

function formatQuestionnaireAnswer(items: readonly QuestionnaireItemPayload[], form: HTMLFormElement): string {
  const data = new FormData(form)
  const lines = items.map((item) => {
    const labelByValue = new Map(item.choices.map((choice) => [choice.value, choice.label]))
    const values = data.getAll(item.name).map(String).map((value) => labelByValue.get(value) ?? value).filter(Boolean)
    return `- ${item.prompt}：${values.length ? values.join('、') : '已跳过'}`
  })
  return `问卷回答：\n${lines.join('\n')}`
}

export function QuestionnaireBubble() {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const messages = useMessages((state) => state.byConvo[message.conversationId] ?? EMPTY_MESSAGES)
  const meId = useMe()
  const [submitting, setSubmitting] = useState(false)
  const questionnaire = message.questionnaire
  const answer = useMemo(
    () => messages.find((candidate) => candidate.quotedMessageId === message.id && candidate.authorId === meId),
    [meId, message.id, messages],
  )

  if (!questionnaire?.items.length) return null

  if (answer) {
    return (
      <Card data-questionnaire-state="answered" className="mt-2 w-full max-w-xl" size="sm">
        <CardHeader>
          <CardTitle>{questionnaire.title ?? 'Agent 提问'}</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{answer.body}</CardContent>
      </Card>
    )
  }

  const itemDefinitions = questionnaire.items.map((item) => ({
    name: item.name,
    required: item.required,
    choices: item.choices.map((choice) => ({ value: choice.value, disabled: choice.disabled })),
  }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const body = formatQuestionnaireAnswer(questionnaire.items, event.currentTarget)
    setSubmitting(true)
    void sendUserMessage(message.conversationId, body, null, message.id).finally(() => setSubmitting(false))
  }

  return (
    <Questionnaire.Root items={itemDefinitions} shortcuts="letters" onSubmit={submit} className="mt-2 max-w-xl">
      <Card data-questionnaire-state="pending" className="w-full" size="sm">
        <CardHeader className="has-data-[slot=questionnaire-progress]:grid-cols-[1fr_auto]">
          <CardTitle>{questionnaire.title ?? 'Agent 提问'}</CardTitle>
          <Questionnaire.Progress aria-label="提问进度" className="col-start-2 row-start-1" />
        </CardHeader>
        <CardContent>
          {questionnaire.items.map((item) => (
            <Questionnaire.Item
              key={item.name}
              name={item.name}
              required={item.required}
              multiple={item.multiple}
            >
              <Questionnaire.Title>{item.prompt}</Questionnaire.Title>
              {item.description ? <Questionnaire.Description>{item.description}</Questionnaire.Description> : null}
              <Questionnaire.Choices className="grid gap-3">
                {item.choices.map((choice) => (
                  <Questionnaire.Choice key={choice.value} value={choice.value} disabled={choice.disabled} className="rounded-md border border-input p-3">
                    <Questionnaire.ChoiceLabel>{choice.label}</Questionnaire.ChoiceLabel>
                    {choice.description ? (
                      <span className="block text-sm text-muted-foreground">{choice.description}</span>
                    ) : null}
                  </Questionnaire.Choice>
                ))}
                {item.input ? (
                  <Questionnaire.Input
                    aria-label={item.input.label}
                    placeholder={item.input.placeholder ?? '输入其他答案…'}
                  />
                ) : null}
              </Questionnaire.Choices>
              <Questionnaire.Error>{item.required ? '请选择或填写一个答案。' : '请选择答案，或使用“跳过”。'}</Questionnaire.Error>
            </Questionnaire.Item>
          ))}
        </CardContent>
        <CardFooter>
          <div className="flex w-full items-center justify-end gap-2">
            <Questionnaire.Previous>上一步</Questionnaire.Previous>
            <Questionnaire.Skip>跳过</Questionnaire.Skip>
            <Questionnaire.Next>下一步</Questionnaire.Next>
            <Questionnaire.Submit disabled={submitting}>
              {submitting ? '发送中…' : (questionnaire.submitLabel ?? '发送回答')}
            </Questionnaire.Submit>
          </div>
        </CardFooter>
      </Card>
    </Questionnaire.Root>
  )
}
