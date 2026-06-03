import type { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { query, queryOne } from '../db.ts'
import type { AuthRequest, DbUser } from '../types.ts'

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 3_600_000,
  rateLimit: true,
})

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid!, (err, key) => {
      if (err || !key) return reject(err ?? new Error('No key found'))
      resolve(key.getPublicKey())
    })
  })
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ detail: 'Missing authorization header' })
    return
  }

  const token = header.slice(7)

  let payload: jwt.JwtPayload
  try {
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string') throw new Error('Malformed token')
    const signingKey = await getSigningKey(decoded.header)
    payload = jwt.verify(token, signingKey, {
      audience: process.env.AZURE_CLIENT_ID,
      algorithms: ['RS256'],
    }) as jwt.JwtPayload
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(401).json({ detail: `Invalid token: ${msg}` })
    return
  }

  const azureId: string = payload['oid'] ?? payload['sub'] ?? ''
  const email: string = payload['preferred_username'] ?? payload['email'] ?? ''
  const displayName: string = payload['name'] ?? email

  if (!azureId) {
    res.status(401).json({ detail: 'Token missing user identity' })
    return
  }

  // Upsert user on every request (keeps name/email in sync with Azure AD)
  let user = await queryOne<DbUser>(
    'SELECT * FROM users WHERE azure_id = $1',
    [azureId]
  )

  if (!user) {
    const rows = await query<DbUser>(
      `INSERT INTO users (azure_id, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (azure_id) DO UPDATE SET email = $2, display_name = $3, updated_at = NOW()
       RETURNING *`,
      [azureId, email, displayName]
    )
    user = rows[0]
  } else if (user.email !== email || user.display_name !== displayName) {
    const rows = await query<DbUser>(
      `UPDATE users SET email = $1, display_name = $2, updated_at = NOW()
       WHERE azure_id = $3 RETURNING *`,
      [email, displayName, azureId]
    )
    user = rows[0]
  }

  if (!user!.is_active) {
    res.status(403).json({ detail: 'Account is disabled' })
    return
  }

  req.user = user!
  next()
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role)) {
      res.status(403).json({ detail: `Required role: ${roles.join(' or ')}` })
      return
    }
    next()
  }
}
