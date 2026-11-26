/** Step 2: platform redirects back here with ?code=…; finish and return to the dashboard. */
export default defineEventHandler(async (event) => {
  const p = getRouterParam(event, 'platform')
  if (!isConnectPlatform(p)) throw createError({ statusCode: 404, message: 'Unknown platform' })
  const back = (q: Record<string, string>) => sendRedirect(event, `/destinations?${new URLSearchParams(q)}`, 302)

  const session = await getUserSession(event)
  if (!session.user) return sendRedirect(event, '/login', 302)

  const q = getQuery(event)
  const state = getCookie(event, 'oauth_state')
  const verifier = getCookie(event, 'oauth_verifier')
  const cookie = { path: `/api/connect/${p}` }
  deleteCookie(event, 'oauth_state', cookie)
  deleteCookie(event, 'oauth_verifier', cookie)

  if (q.error) return back({ connect_error: `${PROVIDERS[p].name}: ${String(q.error_description ?? q.error)}` })
  if (!q.code || !state || q.state !== state) return back({ connect_error: 'Sign-in expired or was tampered with. Please try again.' })

  try {
    const tokens = await exchangeCode(event, p, String(q.code), verifier)
    const cred = oauthCredentials(event, p)!
    const account = await PROVIDERS[p].fetchAccount(tokens.accessToken, cred.clientId)
    await applyConnection(event, session.user.id, p, tokens, account)
    return back({ connected: p })
  } catch (e) {
    console.error(`[connect:${p}]`, e)
    return back({ connect_error: e instanceof ConnectError ? e.message : `Could not connect ${PROVIDERS[p].name}` })
  }
})
