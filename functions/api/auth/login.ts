import {
  createSession,
  isSecure,
  json,
  readCredentials,
  sessionCookie,
  validateUsername,
  verifyPassword,
  type Ctx,
} from '../../_lib/auth'

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const creds = await readCredentials(ctx.request)
  if (!creds) return json({ error: 'request body is not valid JSON' }, 400)

  // Normalize then look up; a bad shape or a miss both surface the same generic
  // message so usernames aren't probeable through the login endpoint.
  const id = validateUsername(creds.username)
  const row = id
    ? await ctx.env.DB.prepare('SELECT id, name, pw_salt, pw_hash FROM users WHERE id = ?')
        .bind(id)
        .first<{ id: string; name: string; pw_salt: string; pw_hash: string }>()
    : null

  if (!row || !(await verifyPassword(creds.password, row.pw_salt, row.pw_hash))) {
    return json({ error: "That username or password didn't match." }, 401)
  }

  const token = await createSession(ctx.env.DB, row.id)
  return json(
    { user: { id: row.id, name: row.name } },
    200,
    { 'Set-Cookie': sessionCookie(token, isSecure(ctx.request)) },
  )
}
