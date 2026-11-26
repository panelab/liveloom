/** Re-fetch the stream key (e.g. after resetting it on the platform). */
export default defineEventHandler(async (event) => {
  const { user } = await requireChannel(event)
  const p = getRouterParam(event, 'platform')
  if (!isConnectPlatform(p)) throw createError({ statusCode: 404, message: 'Unknown platform' })
  const cred = oauthCredentials(event, p)
  if (!cred) throw createError({ statusCode: 503, message: `${PROVIDERS[p].name} connect is not configured` })
  try {
    const { tokens, accessToken } = await connectionToken(event, user.id, p)
    const account = await PROVIDERS[p].fetchAccount(accessToken, cred.clientId)
    await applyConnection(event, user.id, p, tokens ?? { accessToken, refreshToken: null, expiresAt: null, scopes: null }, account)
    return { ok: true, username: account.username }
  } catch (e) {
    if (e instanceof ConnectError) throw createError({ statusCode: 502, message: e.message })
    throw e
  }
})
