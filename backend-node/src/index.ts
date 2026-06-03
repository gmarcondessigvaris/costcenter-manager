import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import authRouter from './routes/auth.ts'
import usersRouter from './routes/users.ts'
import costCentersRouter from './routes/costCenters.ts'
import budgetsRouter from './routes/budgets.ts'
import invoicesRouter from './routes/invoices.ts'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'uploads'

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }))
app.use(express.json())

app.use(authRouter)
app.use(usersRouter)
app.use(costCentersRouter)
app.use(budgetsRouter)
app.use(invoicesRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`âœ“ SIGVARIS Cost Center API running on http://localhost:${PORT}`)
  console.log(`  Docs: use any REST client â€” no Swagger in this build`)
})
