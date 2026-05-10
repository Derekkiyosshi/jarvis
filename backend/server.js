const express = require('express')
const cors = require('cors')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3131
const MEMORY_FILE = path.join(__dirname, 'memory.json')
const MAX_HISTORY = 10
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'out')

app.use(cors())
app.use(express.json())

// Serve static frontend if built
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR))
}

function loadMemory(sessionId) {
  if (!fs.existsSync(MEMORY_FILE)) return []
  try {
    const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'))
    return data[sessionId] || []
  } catch { return [] }
}

function saveMemory(sessionId, history) {
  let data = {}
  if (fs.existsSync(MEMORY_FILE)) {
    try { data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8')) } catch {}
  }
  data[sessionId] = history.slice(-MAX_HISTORY)
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2))
}

function buildPrompt(history, userMessage) {
  let prompt = `Você é Jarvis, assistente pessoal do Derek. Responda sempre em português, de forma direta e inteligente. Você tem acesso total ao computador do Derek via Claude Code — pode criar arquivos, editar código, chamar MCPs, acessar Obsidian, N8N e qualquer ferramenta configurada.\n\n`

  if (history.length > 0) {
    prompt += `=== Histórico recente ===\n`
    history.forEach(h => {
      prompt += `Derek: ${h.user}\nJarvis: ${h.assistant}\n`
    })
    prompt += `========================\n\n`
  }

  prompt += `Derek: ${userMessage}\nJarvis:`
  return prompt
}

app.get('/health', (req, res) => {
  res.json({ status: 'online', version: '1.0.0' })
})

app.post('/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body

  if (!message) return res.status(400).json({ error: 'Mensagem vazia' })

  const history = loadMemory(sessionId)
  const prompt = buildPrompt(history, message)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')

  let fullResponse = ''

  const child = spawn('claude', ['-p', prompt], {
    env: { ...process.env },
    shell: true
  })

  child.stdout.on('data', (data) => {
    const chunk = data.toString()
    fullResponse += chunk
    res.write(chunk)
  })

  child.stderr.on('data', (data) => {
    console.error('Claude stderr:', data.toString())
  })

  child.on('close', () => {
    history.push({ user: message, assistant: fullResponse.trim() })
    saveMemory(sessionId, history)
    res.end()
  })

  child.on('error', (err) => {
    console.error('Erro ao chamar Claude:', err)
    res.write('Erro ao conectar com Claude Code. Verifique se está autenticado.')
    res.end()
  })
})

app.delete('/memory/:sessionId', (req, res) => {
  const { sessionId } = req.params
  let data = {}
  if (fs.existsSync(MEMORY_FILE)) {
    try { data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8')) } catch {}
  }
  delete data[sessionId]
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2))
  res.json({ ok: true })
})

// SPA fallback — serve index.html for all unmatched routes
app.get('*', (req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(404).send('Frontend não buildado. Rode: cd frontend && npm run build')
  }
})

app.listen(PORT, () => {
  console.log(`\n🟢 Jarvis rodando em http://localhost:${PORT}`)
  if (fs.existsSync(FRONTEND_DIR)) {
    console.log(`   Frontend: http://localhost:${PORT}`)
  } else {
    console.log(`   ⚠️  Frontend não encontrado — rode: cd frontend && npm run build`)
  }
  console.log(`   API: http://localhost:${PORT}/health\n`)
})
