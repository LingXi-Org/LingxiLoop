import { fileTools } from './file-tools.js'
import type { createLingxiOS, ToolDefinition } from '@lyyzka/lingxios'
import { documentTools } from '../modules/documents/public.js'
import { createCanvasTools } from '../modules/canvas/index.js'
import { learningTools } from '../modules/learning/public.js'
import { directoryTools } from '../modules/agents/index.js'
import { researchTools } from '../modules/research/index.js'
import { pollTools } from '../modules/polls/index.js'
import { conversationTools } from '../modules/conversations/public.js'
import { createMessageTools } from '../im/public.js'
import { knowledgeTools } from '../modules/knowledge/public.js'
import { presentationTools } from '../modules/presentations/public.js'
import { createRoutineTools } from '../modules/routines/public.js'

export function createProductTools(control: () => ReturnType<typeof createLingxiOS>): ToolDefinition[] {
  return [...fileTools, ...documentTools, ...createCanvasTools(control), ...learningTools,
    ...directoryTools, ...researchTools, ...pollTools, ...conversationTools, ...createMessageTools(control),
    ...knowledgeTools, ...presentationTools, ...createRoutineTools(control)]
}
