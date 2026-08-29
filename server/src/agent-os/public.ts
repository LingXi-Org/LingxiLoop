import { pool } from '../db/pool.js'
import { assertTeacherRoomAccessible } from '../modules/learning/public.js'
import { wukongClient } from '../im/wukong.js'
import { AgentControlApplication } from './control-application.js'

export const agentControlApplication = new AgentControlApplication({
  db: pool,
  assertChannelAccessible: assertTeacherRoomAccessible,
  sendMessage: (...args) => wukongClient().sendMessage(...args),
})
