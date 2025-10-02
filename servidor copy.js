const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;
const AUTH_TOKEN = 'ALERTA123';

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'mikrotik-session' }),
  puppeteer: {
    headless: false,
    args: ['--no-sandbox'],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

let isReady = false;

// Escaneo de QR
client.on('qr', (qr) => {
  console.log('🟡 Escanea este QR con tu WhatsApp:');
  qrcode.generate(qr, { small: true });
});

// Listo
client.on('ready', () => {
  console.log('✅ WhatsApp listo para enviar mensajes.');
  isReady = true;
});


client.on('message', async (message) => {
  console.log('📩 Mensaje recibido de:', message.from);
  console.log('💬 Contenido:', message.body);

  // Si quieres responder automáticamente:
  // await message.reply('Gracias por tu mensaje');
});


// Fallo de autenticación
client.on('auth_failure', (msg) => {
  console.error('❌ Error de autenticación:', msg);
});

// Desconexión
client.on('disconnected', (reason) => {
  console.log('🔌 Cliente desconectado:', reason);
  isReady = false;
});

// Inicializar WhatsApp
client.initialize();

// Middleware para leer JSON
app.use(express.json());

// Rate limit por IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // máximo 5 solicitudes por IP por minuto
  message: '🚫 Demasiadas solicitudes, intenta más tarde.'
});
app.use('/send', limiter);

// Nuevo endpoint POST /send
app.post('/send', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  const { msg, numeros } = req.body;

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: '❌ Token inválido' });
  }

  if (!msg || typeof msg !== 'string' || !msg.trim()) {
    return res.status(400).json({ error: '❌ Mensaje vacío o inválido' });
  }

  if (!Array.isArray(numeros) || numeros.length === 0) {
    return res.status(400).json({ error: '❌ Lista de números inválida' });
  }

  if (!isReady) {
    return res.status(503).json({ error: '⏳ WhatsApp aún no está listo' });
  }

  // Validar y preparar números
  const numerosArray = numeros
    .map(n => String(n).trim())
    .filter(n => /^\d{10}$/.test(n))
    .map(n => ({
      local: n,
      jid: '521' + n + '@c.us'
    }));

  if (numerosArray.length === 0) {
    return res.status(400).json({ error: '❌ Ningún número válido proporcionado' });
  }

  const resultados = [];

  for (const { local, jid } of numerosArray) {
    try {
      const isRegistered = await client.isRegisteredUser(jid);
      if (!isRegistered) {
        console.warn(`⚠️ ${local} no está registrado en WhatsApp.`);
        resultados.push({ numero: local, estado: '❌ No registrado en WhatsApp' });
        continue;
      }

      console.log(`📤 Enviando mensaje a ${jid}`);
      await client.sendMessage(jid, msg);
      resultados.push({ numero: local, estado: '✅ Enviado' });
    } catch (err) {
      console.error(`❌ Error al enviar a ${local}:`, err.message);
      resultados.push({ numero: local, estado: '❌ Error', error: err.message });
    }
  }

  res.json({ resultado: resultados });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express iniciado en http://localhost:${PORT}`);
});
