import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
})

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err)
})

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pool.query(text, params)
  return (result.rows[0] ?? null) as T | null
}

// Run multiple statements in a single transaction
export async function withTransaction<T>(
  fn: (q: <R extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const txQuery = async <R extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]> => {
      const res = await client.query(text, params)
      return res.rows as R[]
    }
    const result = await fn(txQuery)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export default pool
