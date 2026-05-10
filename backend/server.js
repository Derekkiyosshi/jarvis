const express = require('express')
const cors = require('cors')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3131
const MEMORY_FILE = path.join(__dirname, 'memory.json')
const MAX_HISTORY = 10

app.use(cors())
app.use(express.json())

function loadMemory(sessionId) {
  if (!fs.existsSync(MEMORY_FILE)) return {}
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

  child.on('close', (code) => {
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

app.listen(PORT, () => {
  console.log(`\n🟢 Jarvis backend rodando em http://localhost:${PORT}`)
  console.log(`   Aguardando comandos do Derek...\n`)
})
