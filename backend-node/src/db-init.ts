import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'
import pool from './db.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8')

console.log('Initialising database schemaâ€¦')
try {
  await pool.query(sql)
  console.log('âœ“ Schema applied successfully.')
} catch (err) {
  console.error('âœ— Schema init failed:', err)
  process.exit(1)
} finally {
  await pool.end()
}
