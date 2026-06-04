import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import authRouter from './routes/auth.ts'
import devAuthRouter from './routes/devAuth.ts'
import usersRouter from './routes/users.ts'
import costCentersRouter from './routes/costCenters.ts'
import budgetsRouter from './routes/budgets.ts'
import invoicesRouter from './routes/invoices.ts'
import accountsRouter from './routes/accounts.ts'
import itrCodesRouter from './routes/itrCodes.ts'
import reportsRouter from './routes/reports.ts'
import currenciesRouter from './routes/currencies.ts'
import settingsRouter from './routes/settings.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT ?? 3001)
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'uploads'
const DIST = path.join(__dirname, '../../frontend/dist')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }))
app.use(express.json())

// API routes — mounted under /api to match the built frontend's axios baseURL
app.use('/api', authRouter)
app.use('/api', devAuthRouter)
app.use('/api', usersRouter)
app.use('/api', costCentersRouter)
app.use('/api', budgetsRouter)
app.use('/api', invoicesRouter)
app.use('/api', accountsRouter)
app.use('/api', itrCodesRouter)
app.use('/api', reportsRouter)
app.use('/api', currenciesRouter)
app.use('/api', settingsRouter)
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Serve built frontend if dist exists
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
  console.log(`Serving frontend from ${DIST}`)
}

// Global error handler — catches any unhandled async error from route handlers
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[unhandled error]', err)
  res.status(500).json({ detail: err?.message ?? 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`✓ SIGVARIS Cost Center Manager → http://localhost:${PORT}`)
})
