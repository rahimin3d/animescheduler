import { json, resolveUser, type Ctx } from '../../_lib/auth'

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const user = await resolveUser(ctx.env.DB, ctx.request)
  return json({ user })
}
