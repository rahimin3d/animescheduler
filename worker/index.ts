/**
 * Cloudflare Worker entry: routes /api/* to the handlers in functions/ and
 * serves the built SPA from dist/ (see [assets] in wrangler.toml).
 */
import * as state from '../functions/api/state'
import * as login from '../functions/api/auth/login'
import * as logout from '../functions/api/auth/logout'
import * as me from '../functions/api/auth/me'
import * as signup from '../functions/api/auth/signup'
import { json, type Env as DbEnv } from '../functions/_lib/auth'

interface Env extends DbEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

type Handler = (ctx: { request: Request; env: Env }) => Promise<Response>

const routes: Record<string, Partial<Record<string, Handler>>> = {
  '/api/state': { GET: state.onRequestGet, PUT: state.onRequestPut },
  '/api/auth/login': { POST: login.onRequestPost },
  '/api/auth/logout': { POST: logout.onRequestPost },
  '/api/auth/me': { GET: me.onRequestGet },
  '/api/auth/signup': { POST: signup.onRequestPost },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const route = routes[pathname.replace(/\/+$/, '')]
    if (!route) return json({ error: 'not found' }, 404)
    const handler = route[request.method]
    if (!handler) return json({ error: 'method not allowed' }, 405)
    return handler({ request, env })
  },
}
