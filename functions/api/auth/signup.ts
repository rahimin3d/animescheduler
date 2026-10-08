import {
  USERNAME_RULE,
  createSession,
  isSecure,
  json,
  newPasswordRecord,
  readCredentials,
  sessionCookie,
  validatePassword,
  validateUsername,
  type Ctx,
} from '../../_lib/auth'

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const creds = await readCredentials(ctx.request)
  if (!creds) return json({ error: 'request body is not valid JSON' }, 400)

  const id = validateUsername(creds.username)
  if (!id) return json({ error: USERNAME_RULE }, 400)
  const pwError = validatePassword(creds.password)
  if (pwError) return json({ error: pwError }, 400)

  const existing = await ctx.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first<{ id: string }>()
  if (existing) return json({ error: 'That username is already taken — try another.' }, 409)

  const name = creds.username.trim()
  const record = await newPasswordRecord(creds.password)
  await ctx.env.DB.prepare('INSERT INTO users (id, name, pw_salt, pw_hash) VALUES (?, ?, ?, ?)')
    .bind(id, name, record.salt, record.hash)
    .run()

  const token = await createSession(ctx.env.DB, id)
  return json(
    { user: { id, name } },
    201,
    { 'Set-Cookie': sessionCookie(token, isSecure(ctx.request)) },
  )
}
