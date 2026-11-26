/** Step 1: send the user to the platform's sign-in page. */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const p = getRouterParam(event, 'platform')
  if (!isConnectPlatform(p)) throw createError({ statusCode: 404, message: 'Unknown platform' })
  const cred = oauthCredentials(event, p)
  if (!cred) throw createError({ statusCode: 503, message: `${PROVIDERS[p].name} connect is not configured on this server` })

  const provider = PROVIDERS[p]
  const state = randomUrlToken(24)
  const verifier = provider.pkce ? randomUrlToken(48) : undefined
  const cookie = { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax' as const, path: `/api/connect/${p}`, maxAge: 600 }
  setCookie(event, 'oauth_state', state, cookie)
  if (verifier) setCookie(event, 'oauth_verifier', verifier, cookie)

  const url = new URL(provider.authorizeUrl)
  url.search = new URLSearchParams({
    client_id: cred.clientId,
    redirect_uri: redirectUri(event, p),
    response_type: 'code',
    scope: provider.scopes.join(' '),
    state,
    ...(verifier ? { code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256' } : {}),
    ...provider.extraAuthParams,
  }).toString()
  return sendRedirect(event, url.toString(), 302)
})
