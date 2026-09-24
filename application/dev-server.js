import express from 'express'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env from frontend/.env.local and backend/.env
config({ path: join(__dirname, 'frontend', '.env.local') })
config({ path: join(__dirname, 'backend', '.env') })

// Dynamically import the API handlers
const chatModule = await import('./api/chat.js')
const chatHandler = chatModule.default

const prolificVerifyModule = await import('./api/prolific-verify.js')
const prolificVerifyHandler = prolificVerifyModule.default

const prolificClaimModule = await import('./api/prolific-claim.js')
const prolificClaimHandler = prolificClaimModule.default

const prolificStateModule = await import('./api/prolific-state.js')
const prolificStateHandler = prolificStateModule.default

const prolificAdvanceStageModule = await import('./api/prolific-advance-stage.js')
const prolificAdvanceStageHandler = prolificAdvanceStageModule.default

const prolificHistoryModule = await import('./api/prolific-history.js')
const prolificHistoryHandler = prolificHistoryModule.default

const prolificTestResetModule = await import('./api/prolific-test-reset.js')
const prolificTestResetHandler = prolificTestResetModule.default

const app = express()
app.use(express.json())

app.all('/api/chat', (req, res) => chatHandler(req, res))
app.all('/api/prolific-verify', (req, res) => prolificVerifyHandler(req, res))
app.all('/api/prolific-claim', (req, res) => prolificClaimHandler(req, res))
app.all('/api/prolific-state', (req, res) => prolificStateHandler(req, res))
app.all('/api/prolific-advance-stage', (req, res) => prolificAdvanceStageHandler(req, res))
app.all('/api/prolific-history', (req, res) => prolificHistoryHandler(req, res))
app.all('/api/prolific-test-reset', (req, res) => prolificTestResetHandler(req, res))

const PORT = 3001
app.listen(PORT, () => {
  console.log(`API dev server running on http://localhost:${PORT}`)
})
