import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext } from '../../http/request-context.js'
import { BoardApplicationError } from './application.js'
import {
  createBoardRequestSchema,
  createCardRequestSchema,
  createColumnRequestSchema,
  createCommentRequestSchema,
  updateBoardRequestSchema,
  updateCardRequestSchema,
  updateColumnRequestSchema,
} from './contracts.js'
import { boardApplication } from './facade.js'

export const boardsRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapBoardError(error: unknown): never {
  if (!(error instanceof BoardApplicationError)) throw error
  throw new HttpError(404, error.message)
}

boardsRouter.get('/boards', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  res.json(await boardApplication.boards(scope))
}))

boardsRouter.get('/cards/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  try { res.json(await boardApplication.card(scope, String(req.params.id))) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.post('/boards', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(createBoardRequestSchema.safeParse(req.body ?? {}))
  res.json(await boardApplication.createBoard(scope, input))
}))

boardsRouter.get('/boards/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  try { res.json(await boardApplication.snapshot(scope, String(req.params.id))) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.patch('/boards/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(updateBoardRequestSchema.safeParse(req.body ?? {}))
  try { res.json(await boardApplication.editBoard(scope, String(req.params.id), input)) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.delete('/boards/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  try { res.json(await boardApplication.removeBoard(scope, String(req.params.id))) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.post('/boards/:id/columns', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(createColumnRequestSchema.safeParse(req.body ?? {}))
  try { res.json(await boardApplication.addColumn(scope, String(req.params.id), input.title)) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.patch('/boards/:bid/columns/:cid', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(updateColumnRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await boardApplication.editColumn(
      scope, String(req.params.bid), String(req.params.cid), input,
    ))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.delete('/boards/:bid/columns/:cid', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  try {
    res.json(await boardApplication.removeColumn(scope, String(req.params.bid), String(req.params.cid)))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.post('/boards/:id/cards', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(createCardRequestSchema.safeParse(req.body ?? {}))
  try { res.json(await boardApplication.createCard(scope, String(req.params.id), input)) }
  catch (error) { mapBoardError(error) }
}))

boardsRouter.patch('/boards/:bid/cards/:cid', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(updateCardRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await boardApplication.editCard(
      scope, String(req.params.bid), String(req.params.cid), input,
    ))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.delete('/boards/:bid/cards/:cid', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  try {
    res.json(await boardApplication.removeCard(scope, String(req.params.bid), String(req.params.cid)))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.get('/boards/:bid/cards/:cid/comments', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  try {
    res.json(await boardApplication.comments(scope, String(req.params.bid), String(req.params.cid)))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.post('/boards/:bid/cards/:cid/comments', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(createCommentRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await boardApplication.addComment(
      scope, String(req.params.bid), String(req.params.cid), input.body,
    ))
  } catch (error) { mapBoardError(error) }
}))

boardsRouter.delete('/boards/:bid/cards/:cid/comments/:mid', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  try {
    res.json(await boardApplication.removeComment(
      scope, String(req.params.bid), String(req.params.cid), String(req.params.mid),
    ))
  } catch (error) { mapBoardError(error) }
}))
