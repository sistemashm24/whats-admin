const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "W1SPR3M0T3";

// =============================================
// 📱 CONFIGURACIÓN TELEGRAM - SOLO NOTIFICACIONES
// =============================================

const TELEGRAM_BOT_TOKEN = "7883968177:AAFCc-liVJJp0Ja-GLQFb1MEc4f6RloywA4";
const TELEGRAM_CHAT_ID = "7743621185";
let lastNotificationSent = null;

// =============================================
// 🔔 MÓDULO DE NOTIFICACIONES TELEGRAM
// =============================================

const sendTelegramNotification = async (message) => {
  try {
    const now = new Date();
    if (lastNotificationSent && now - lastNotificationSent < 30000) {
      console.log("⏸️ Notificación omitida (demasiado pronto)");
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });

    console.log("✅ Notificación Telegram enviada");
    lastNotificationSent = now;
    return response.data;
  } catch (error) {
    console.error("❌ Error enviando notificación Telegram:", error.message);
  }
};

// =============================================
// 🤖 MÓDULO CLIENTE WHATSAPP OPTIMIZADO PARA LINUX
// =============================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.CLIENT_ID || "whatsapp-bot-vps",
  }),
  puppeteer: {
    headless: true, // ✅ IMPORTANTE: true para servidor Linux
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox", 
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--single-process", // ✅ Optimización para Linux
      "--disable-features=VizDisplayCompositor",
      "--disable-software-rasterizer",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--memory-pressure-off",
    ],
    executablePath: process.env.CHROME_PATH || "/usr/bin/chromium-browser", // ✅ Chromium en Linux
    ignoreDefaultArgs: ["--disable-extensions"],
    timeout: 60000,
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

// =============================================
// 🏗️ VARIABLES DE ESTADO GLOBAL
// =============================================

let isReady = false;
let qrCodeUrl = null;
let sessionStatus = "initializing";
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// =============================================
// ⚙️ MÓDULO DE CONFIGURACIÓN EXPRESS
// =============================================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "🚫 Demasiadas solicitudes, intenta más tarde." },
});
app.use("/send", limiter);

// =============================================
// 🔄 MÓDULO DE EVENTOS WHATSAPP
// =============================================

client.on("qr", (qr) => {
  console.log("🟡 QR generado - Escanea desde tu WhatsApp:");
  qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  qrcode.generate(qr, { small: true });
  sessionStatus = "waiting_for_scan";
  initializationAttempts = 0;

  sendTelegramNotification(`
🔐 <b>WHATSAPP BOT - QR REQUERIDO</b>

⚠️ Necesita autenticación con QR

📱 <b>Pasos:</b>
1. Abre WhatsApp → Menú → Dispositivos vinculados
2. Escanea este QR
3. Confirma la sesión

🌐 <b>URL QR:</b> http://YOUR_VPS_IP:${PORT}/qr
🕐 <i>${new Date().toLocaleString()}</i>
  `);
});

client.on("ready", () => {
  console.log("✅ WhatsApp conectado y listo");
  isReady = true;
  sessionStatus = "authenticated";
  qrCodeUrl = null;
  initializationAttempts = 0;

  sendTelegramNotification(`
✅ <b>WHATSAPP BOT - CONECTADO</b>

¡Sesión activa en el VPS!

🌐 <b>Servidor:</b> Puerto ${PORT}
🕐 <b>Inicio:</b> ${new Date().toLocaleString()}
📊 <b>Estado:</b> Listo para enviar mensajes
  `);
});

client.on("auth_failure", async (msg) => {
  console.error("❌ Error de autenticación:", msg);
  sessionStatus = "auth_failure";
  isReady = false;

  sendTelegramNotification(`
❌ <b>ERROR DE AUTENTICACIÓN</b>

Fallo en WhatsApp: ${msg}

🕐 ${new Date().toLocaleString()}
  `);
});

client.on("disconnected", async (reason) => {
  console.log("🔌 Desconectado:", reason);
  isReady = false;
  sessionStatus = "disconnected";

  sendTelegramNotification(`
🔌 <b>WHATSAPP DESCONECTADO</b>

Razón: ${reason}

🔄 Reconectando automáticamente...
🕐 ${new Date().toLocaleString()}
  `);

  const delay = Math.min(10000 * (initializationAttempts + 1), 60000);
  setTimeout(() => initializeClient(), delay);
});

// =============================================
// 🔧 MÓDULO DE INICIALIZACIÓN WHATSAPP
// =============================================

const initializeClient = async () => {
  if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
    console.error("🚫 Máximo de intentos alcanzado");
    sendTelegramNotification(`
🚫 <b>MÁXIMO DE INTENTOS</b>

No se pudo conectar WhatsApp después de ${MAX_INIT_ATTEMPTS} intentos

🔧 Reinicia el servicio manualmente
    `);
    return;
  }

  initializationAttempts++;
  console.log(`🔄 Intento ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`);

  try {
    await client.initialize();
    console.log("✅ Cliente WhatsApp inicializado");
  } catch (error) {
    console.error(`❌ Error:`, error.message);

    if (initializationAttempts === 1) {
      sendTelegramNotification(`
⚠️ <b>ERROR EN INICIALIZACIÓN</b>

Error: ${error.message}
Intento: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}

🔄 Reintentando...
      `);
    }

    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      const delay = 5000 * initializationAttempts;
      setTimeout(() => initializeClient(), delay);
    }
  }
};

// =============================================
// 🌐 MÓDULO DE ENDPOINTS API
// =============================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    whatsapp: {
      ready: isReady,
      sessionStatus: sessionStatus,
      qrAvailable: !!qrCodeUrl,
    },
    server: {
      port: PORT,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }
  });
});

app.get("/qr", (req, res) => {
  if (qrCodeUrl) {
    res.json({ qrUrl: qrCodeUrl, status: sessionStatus });
  } else {
    res.json({ 
      status: sessionStatus, 
      message: isReady ? "WhatsApp autenticado" : "QR no disponible" 
    });
  }
});

app.post("/send", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "❌ Token inválido" });
  }

  const { msg, numeros } = req.body;

  if (!msg || !Array.isArray(numeros) || numeros.length === 0) {
    return res.status(400).json({ error: "❌ Datos inválidos" });
  }

  if (!isReady) {
    return res.status(503).json({ error: "⏳ WhatsApp no está listo" });
  }

  const numerosArray = numeros
    .map(n => String(n).replace(/\D/g, ''))
    .filter(n => n.length === 10)
    .map(n => ({ local: n, jid: `521${n}@c.us` }));

  if (numerosArray.length === 0) {
    return res.status(400).json({ error: "❌ Ningún número válido" });
  }

  const resultados = [];
  let errores = 0;

  for (const { local, jid } of numerosArray) {
    try {
      const isRegistered = await client.isRegisteredUser(jid);
      if (!isRegistered) {
        resultados.push({ numero: local, estado: "❌ No registrado" });
        continue;
      }

      await client.sendMessage(jid, msg);
      resultados.push({ numero: local, estado: "✅ Enviado" });
    } catch (err) {
      resultados.push({ numero: local, estado: "❌ Error", error: err.message });
      errores++;
    }
  }

  if (errores > numerosArray.length / 2) {
    sendTelegramNotification(`
⚠️ <b>MÚLTIPLES ERRORES EN ENVÍO</b>

Total: ${numerosArray.length}
Éxitos: ${numerosArray.length - errores}
Fallos: ${errores}
    `);
  }

  res.json({ resultado: resultados });
});

app.post("/clean-session", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "❌ Token inválido" });
  }

  try {
    await client.logout();
    const fs = require("fs");
    const sessionPath = "./.wwebjs_auth";
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true });
    }

    sendTelegramNotification("🧹 <b>SESIÓN LIMPIADA</b>\nSe requiere nuevo QR");
    res.json({ success: true, message: "Sesión eliminada" });
  } catch (error) {
    sendTelegramNotification(`❌ <b>ERROR LIMPIANDO SESIÓN</b>\n${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// 🚀 INICIALIZACIÓN Y CONFIGURACIÓN DEL SERVIDOR
// =============================================

const initializeApp = async () => {
  try {
    console.log("🚀 Iniciando WhatsApp Bot en VPS...");

    await sendTelegramNotification(`
🚀 <b>WHATSAPP BOT INICIADO - VPS LINUX</b>

🌐 <b>Servidor:</b> Puerto ${PORT}
🕐 <b>Inicio:</b> ${new Date().toLocaleString()}
📊 <b>Estado:</b> Inicializando...

💻 <b>Ejemplo de uso:</b>
<code>curl -X POST http://YOUR_VPS_IP:${PORT}/send \\
  -H "Authorization: Bearer ${AUTH_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"msg": "Hola desde VPS", "numeros": ["5512345678"]}'</code>
    `);

    setTimeout(initializeClient, 2000);
  } catch (error) {
    console.error("❌ Error inicializando:", error);
  }
};

// =============================================
// ⚡ INICIO DEL SERVIDOR
// =============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor ejecutándose en http://0.0.0.0:${PORT}`);
  console.log(`\n📞 ENDPOINTS:`);
  console.log(`   GET  /health         - Estado del servicio`);
  console.log(`   GET  /qr            - Obtener QR`);
  console.log(`   POST /send          - Enviar mensajes`);
  console.log(`   POST /clean-session - Limpiar sesión`);
  console.log(`\n🔐 Token: ${AUTH_TOKEN}`);
  console.log(`📱 Telegram: ✅ Notificaciones activas\n`);
  
  initializeApp();
});

process.on("SIGINT", async () => {
  console.log("🛑 Cerrando aplicación...");
  await sendTelegramNotification("🛑 <b>SERVICIO CERRADO</b>");
  process.exit(0);
});