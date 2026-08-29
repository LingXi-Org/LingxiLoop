import { env } from '../env.js'
import { ImSessionApplication } from './session-application.js'
import { wukongClient } from './wukong.js'

export const imSessionApplication = new ImSessionApplication({
  userTokenSecret: env.WUKONG_USER_TOKEN_SECRET,
  bootstrap: (userId, token) => wukongClient().bootstrap(userId, token),
})
