import type { createLingxiOS, ToolDefinition } from '@lyyzka/lingxios'
import { calendarTools } from '../modules/calendar/index.js'
import { documentTools } from '../modules/documents/public.js'
import { createCanvasTools } from '../modules/canvas/index.js'
import { learningTools, teacherTools } from '../modules/learning/public.js'
import { directoryTools, handoffTools } from '../modules/agents/index.js'
import { researchTools } from '../modules/research/index.js'
import { pollTools } from '../modules/polls/index.js'
import { conversationTools } from '../modules/conversations/public.js'
import { messageTools } from '../im/public.js'
import { knowledgeTools } from '../modules/knowledge/public.js'
import { emailTools } from '../modules/email/index.js'
import { presentationTools } from '../modules/presentations/public.js'
import { createRoutineTools } from '../modules/routines/public.js'

export function createProductTools(control: () => ReturnType<typeof createLingxiOS>): ToolDefinition[] {
  return [...calendarTools, ...documentTools, ...createCanvasTools(control), ...learningTools, ...teacherTools,
    ...directoryTools, ...handoffTools, ...researchTools, ...pollTools, ...conversationTools, ...messageTools,
    ...knowledgeTools, ...emailTools, ...presentationTools, ...createRoutineTools(control)]
}
