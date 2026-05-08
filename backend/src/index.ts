import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { startSimulator } from './simulator.js'

const PORT = 4000

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`)
  })
})

startSimulator(io)

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
