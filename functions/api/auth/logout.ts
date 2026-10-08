import {
  clearSessionCookie,
  destroySession,
  isSecure,
  json,
  readSessionToken,
  type Ctx,
} from '../../_lib/auth'

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  await destroySession(ctx.env.DB, readSessionToken(ctx.request))
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecure(ctx.request)) })
}
