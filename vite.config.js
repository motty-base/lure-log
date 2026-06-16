import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve('./data')
const DATA_FILE = path.resolve('./data/lures.json')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR)
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ records: [], lureTypes: [], makers: [] }, null, 2), 'utf-8')
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) }
    })
  })
}

function sendJSON(res, data, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    {
      name: 'lure-api',
      configureServer(server) {
        server.middlewares.use('/api/data', async (req, res, next) => {
          if (req.method !== 'GET') return next()
          sendJSON(res, readData())
        })
        server.middlewares.use('/api/data', async (req, res, next) => {
          if (req.method !== 'POST') return next()
          const body = await parseBody(req)
          writeData(body)
          sendJSON(res, { ok: true })
        })
      }
    }
  ]
})