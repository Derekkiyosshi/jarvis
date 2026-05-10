// Mostra a URL atual do Cloudflare Tunnel
const fs = require('fs')
const os = require('os')
const path = require('path')

const logFile = path.join(os.homedir(), '.pm2', 'logs', 'jarvis-tunnel-error.log')

if (!fs.existsSync(logFile)) {
  console.log('❌ Túnel não iniciado. Rode: pm2 start')
  process.exit(1)
}

const log = fs.readFileSync(logFile, 'utf-8')
const match = log.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)

if (match) {
  const urls = [...log.matchAll(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g)]
  const lastUrl = urls[urls.length - 1][0]
  console.log(`\n🟢 Jarvis URL atual:\n\n   ${lastUrl}\n\nAbra este link no celular para usar o Jarvis!\n`)
} else {
  console.log('❌ URL não encontrada. Aguarde alguns segundos e tente novamente.')
}
