import type { HomeworkAnswer } from './homework-contracts.js'

/** Reports and agent text tools consume current business content, never editor recovery state. */
export function homeworkAnswerText(answer: HomeworkAnswer) {
  return { text: answer.text, links: answer.links, attachments: answer.attachments }
}

/** Keep the current native document in shared snapshots without private pre-edit recovery text. */
export function sharedHomeworkAnswer(answer: HomeworkAnswer): HomeworkAnswer {
  const document = answer.editorDocument
  if (!document) return answer
  return { ...answer, editorDocument: {
    format: document.format, version: document.version, blocks: document.blocks,
    projection: document.projection, sections: document.sections,
  } }
}
