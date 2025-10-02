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
const AUTH_TOKEN = process.env.AUTH_TOKEN || "ALERTA123";

// =============================================
// 📱 CONFIGURACIÓN TELEGRAM - SOLO NOTIFICACIONES
// =============================================

const TELEGRAM_BOT_TOKEN = "7883968177:AAFCc-liVJJp0Ja-GLQFb1MEc4f6RloywA4";
const TELEGRAM_CHAT_ID = "7743621185";
let lastNotificationSent = null;

// =============================================
// 🔔 MÓDULO DE NOTIFICACIONES TELEGRAM
// =============================================

/**
 * Función para enviar notificaciones a Telegram - SOLO PARA FALLOS
 */
const sendTelegramNotification = async (message) => {
  try {
    const now = new Date();
    if (lastNotificationSent && now - lastNotificationSent < 30000) {
      console.log("⏸️ Notificación omitida (demasiado pronto)");
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    console.log(`📤 Enviando notificación a Telegram: ${message.substring(0, 100)}...`);
    
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
// 🤖 MÓDULO CLIENTE WHATSAPP
// =============================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.CLIENT_ID || "mikrotik-session",
  }),
  puppeteer: {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--disable-features=VizDisplayCompositor",
    ],
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : "/usr/bin/google-chrome"),
    ignoreDefaultArgs: ["--disable-extensions"],
    timeout: 60000,
  },
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
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

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting para endpoint /send
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: "🚫 Demasiadas solicitudes, intenta más tarde.",
  },
});
app.use("/send", limiter);

// =============================================
// 🔄 MÓDULO DE EVENTOS WHATSAPP - SOLO NOTIFICACIONES DE FALLOS
// =============================================

client.on("qr", (qr) => {
  console.log("🟡 Escanea este QR con tu WhatsApp:");
  qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  qrcode.generate(qr, { small: true });
  sessionStatus = "waiting_for_scan";
  initializationAttempts = 0;

  // ✅ NOTIFICACIÓN: Necesita QR (considerado un "fallo" de conexión)
  sendTelegramNotification(`
🔐 <b>WHATSAPP BOT - REAUTENTICACIÓN REQUERIDA</b>

⚠️ La sesión de WhatsApp necesita reautenticación.

📱 <b>Acciones requeridas:</b>
1. Ve a la aplicación web
2. Escanea el código QR  
3. Confirma la sesión

🕐 <i>Timestamp: ${new Date().toLocaleString()}</i>

🔗 <code>http://localhost:${PORT}/qr</code>
  `);
});

client.on("ready", () => {
  console.log("✅ WhatsApp listo para enviar mensajes.");
  isReady = true;
  sessionStatus = "authenticated";
  qrCodeUrl = null;
  initializationAttempts = 0;

  // ✅ NOTIFICACIÓN: Servicio activo (solo al iniciar)
  sendTelegramNotification(`
✅ <b>WHATSAPP BOT - SESIÓN ACTIVA</b>

¡WhatsApp se ha conectado correctamente!

📊 <b>Estado:</b> Conectado y listo
🕐 <b>Inicio:</b> ${new Date().toLocaleString()}
🌐 <b>Servidor:</b> Puerto ${PORT}

💬 El bot está listo para enviar mensajes.
  `);
});

client.on("authenticated", () => {
  console.log("🔑 Sesión autenticada correctamente.");
  sessionStatus = "authenticated";
});

client.on("auth_failure", async (msg) => {
  console.error("❌ Error de autenticación:", msg);
  sessionStatus = "auth_failure";
  isReady = false;

  // 🔴 NOTIFICACIÓN: FALLO de autenticación
  sendTelegramNotification(`
❌ <b>WHATSAPP BOT - ERROR DE AUTENTICACIÓN</b>

🚨 Fallo en la autenticación de WhatsApp.

📋 <b>Detalles:</b>
• Error: ${msg}
• Timestamp: ${new Date().toLocaleString()}

🔧 <b>Acción requerida:</b>
Reinicia el servicio y escanea el QR nuevamente.
  `);
});

client.on("disconnected", async (reason) => {
  console.log("🔌 Cliente desconectado:", reason);
  isReady = false;
  sessionStatus = "disconnected";

  // 🔴 NOTIFICACIÓN: FALLO de conexión
  sendTelegramNotification(`
🔌 <b>WHATSAPP BOT - SESIÓN DESCONECTADA</b>

⚠️ WhatsApp se ha desconectado.

📋 <b>Razón:</b> ${reason}
🕐 <b>Timestamp:</b> ${new Date().toLocaleString()}

🔄 <b>Acción:</b> 
El sistema intentará reconectar automáticamente.
  `);

  const delay = Math.min(10000 * (initializationAttempts + 1), 60000);
  console.log(`🔄 Intentando reconectar en ${delay / 1000} segundos...`);

  setTimeout(() => {
    initializeClient();
  }, delay);
});

// =============================================
// 🔧 MÓDULO DE INICIALIZACIÓN WHATSAPP
// =============================================

/**
 * Función para inicializar el cliente de WhatsApp
 */
const initializeClient = async () => {
  if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
    console.error("🚫 Máximo número de intentos de inicialización alcanzado");
    
    // 🔴 NOTIFICACIÓN: FALLO máximo de intentos
    sendTelegramNotification(`
🚫 <b>WHATSAPP BOT - MÁXIMO DE INTENTOS ALCANZADO</b>

❌ No se pudo inicializar WhatsApp después de ${MAX_INIT_ATTEMPTS} intentos.

🔧 <b>Acción requerida:</b>
Reinicia manualmente el servicio.
    `);
    return;
  }

  initializationAttempts++;
  console.log(
    `🔄 Intento de inicialización ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`
  );

  try {
    await client.initialize();
    console.log("✅ Cliente WhatsApp inicializado correctamente");
  } catch (error) {
    console.error(
      `❌ Error en intento ${initializationAttempts}:`,
      error.message
    );

    // 🔴 NOTIFICACIÓN: FALLO de inicialización
    if (initializationAttempts === 1) { // Solo notificar en el primer fallo
      sendTelegramNotification(`
⚠️ <b>WHATSAPP BOT - ERROR EN INICIALIZACIÓN</b>

❌ Error al inicializar WhatsApp.

📋 <b>Detalles:</b>
• Error: ${error.message}
• Intento: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}
• Timestamp: ${new Date().toLocaleString()}

🔄 <b>Acción:</b> 
Reintentando automáticamente...
      `);
    }

    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      const delay = 5000 * initializationAttempts;
      console.log(`⏳ Reintentando en ${delay / 1000} segundos...`);

      setTimeout(() => {
        initializeClient();
      }, delay);
    }
  }
};

// =============================================
// 🌐 MÓDULO DE ENDPOINTS API
// =============================================

/**
 * GET /health - Estado del servicio
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    whatsapp: {
      ready: isReady,
      sessionStatus: sessionStatus,
      qrAvailable: !!qrCodeUrl,
      initializationAttempts: initializationAttempts,
    },
    telegram: {
      notifications: "✅ Activas (solo para fallos)",
      chatId: TELEGRAM_CHAT_ID ? "✅ Configurado" : "❌ Faltante",
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /qr - Obtener código QR
 */
app.get("/qr", (req, res) => {
  if (qrCodeUrl) {
    res.json({
      qrUrl: qrCodeUrl,
      status: sessionStatus,
    });
  } else {
    res.json({
      status: sessionStatus,
      message: isReady ? "WhatsApp autenticado" : "QR no disponible",
    });
  }
});

/**
 * POST /send - Enviar mensajes de WhatsApp
 */
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
    .map((n) => String(n).trim())
    .filter((n) => /^\d{10}$/.test(n))
    .map((n) => ({
      local: n,
      jid: "521" + n + "@c.us",
    }));

  if (numerosArray.length === 0) {
    return res.status(400).json({ error: "❌ Ningún número válido" });
  }

  const resultados = [];
  let erroresCriticos = 0;

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
      resultados.push({
        numero: local,
        estado: "❌ Error",
        error: err.message,
      });
      erroresCriticos++;
    }
  }

  // 🔴 NOTIFICACIÓN: Si hay muchos errores en el envío
  if (erroresCriticos > numerosArray.length / 2) {
    sendTelegramNotification(`
⚠️ <b>WHATSAPP BOT - MÚLTIPLES ERRORES EN ENVÍO</b>

❌ Se detectaron múltiples errores al enviar mensajes.

📋 <b>Estadísticas:</b>
• Total: ${numerosArray.length}
• Exitosos: ${numerosArray.length - erroresCriticos}
• Fallidos: ${erroresCriticos}
• Timestamp: ${new Date().toLocaleString()}

🔧 <b>Revisar:</b>
• Conexión a internet
• Estado de WhatsApp
• Números válidos
    `);
  }

  res.json({ resultado: resultados });
});

/**
 * POST /clean-session - Limpiar sesión de WhatsApp
 */
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

    console.log("✅ Sesión limpiada completamente");
    
    // ✅ NOTIFICACIÓN: Sesión limpiada (acción administrativa)
    sendTelegramNotification(`
🧹 <b>WHATSAPP BOT - SESIÓN LIMPIADA</b>

✅ Sesión de WhatsApp limpiada manualmente.

🕐 <i>Timestamp: ${new Date().toLocaleString()}</i>

⚠️ <b>Se requiere nueva autenticación con QR</b>
    `);
    
    res.json({ success: true, message: "Sesión eliminada" });
  } catch (error) {
    // 🔴 NOTIFICACIÓN: FALLO al limpiar sesión
    sendTelegramNotification(`
❌ <b>WHATSAPP BOT - ERROR AL LIMPIAR SESIÓN</b>

🚨 Fallo al intentar limpiar la sesión.

📋 <b>Detalles:</b>
• Error: ${error.message}
• Timestamp: ${new Date().toLocaleString()}
    `);
    
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// 🚀 MÓDULO DE INICIALIZACIÓN DE LA APLICACIÓN
// =============================================

/**
 * Función principal de inicialización de la aplicación
 */
const initializeApp = async () => {
  try {
    console.log("🚀 Iniciando aplicación...");

    // ✅ NOTIFICACIÓN: Inicio del servicio
    sendTelegramNotification(`
🚀 <b>WHATSAPP BOT - INICIANDO SERVICIO</b>

📊 El servicio de WhatsApp Bot se está iniciando.

🌐 <b>Servidor:</b> Puerto ${PORT}
🕐 <b>Inicio:</b> ${new Date().toLocaleString()}

📨 <b>Notificaciones:</b> Activadas (solo para fallos)
💡 <b>Endpoint estado:</b> http://localhost:${PORT}/health

📤 <b>Ejemplo uso /send:</b>
<code>curl -X POST http://localhost:${PORT}/send \\
  -H "Authorization: Bearer CONTRASEÑA" \\
  -H "Content-Type: application/json" \\
  -d '{"msg": "Hola", "numeros": ["5512345678"]}'</code>

⏳ Inicializando WhatsApp...
    `);

    setTimeout(() => {
      initializeClient();
    }, 2000);
  } catch (error) {
    console.error("❌ Error al inicializar aplicación:", error);
  }
};

// =============================================
// ⚡ INICIO DEL SERVIDOR
// =============================================

app.listen(PORT, () => {
  console.log(`🌐 Servidor Express iniciado en http://localhost:${PORT}`);
  console.log(`\n📞 ENDPOINTS DISPONIBLES:`);
  console.log(`   GET  /health          - Estado del servicio`);
  console.log(`   GET  /qr             - Obtener QR code`);
  console.log(`   POST /send           - Enviar mensajes WhatsApp`);
  console.log(`   POST /clean-session  - Limpiar sesión`);
  console.log(`\n🔔 CONFIGURACIÓN TELEGRAM:`);
  console.log(`   • Notificaciones: ✅ Activas (solo para fallos)`);
  console.log(`   • Chat ID: ${TELEGRAM_CHAT_ID ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`\n🔐 Token de autorización: ${AUTH_TOKEN}`);
  console.log(`\n🚨 TELEGRAM NOTIFICARÁ:`);
  console.log(`   • Inicio/cierre del servicio`);
  console.log(`   • Necesidad de QR`);
  console.log(`   • Fallos de autenticación`);
  console.log(`   • Desconexiones`);
  console.log(`   • Errores críticos en envíos`);
  console.log(`   • Fallos de inicialización\n`);

  initializeApp();
});

// =============================================
// 🛑 MÓDULO DE MANEJO DE CERRADO
// =============================================

process.on("SIGINT", async () => {
  console.log("🛑 Cerrando aplicación...");
  
  // ✅ NOTIFICACIÓN: Cierre del servicio
  await sendTelegramNotification(`
🛑 <b>WHATSAPP BOT - SERVICIO CERRADO</b>

El servicio se está cerrando.

🕐 <i>Timestamp: ${new Date().toLocaleString()}</i>

📊 <b>Tiempo activo:</b> ${Math.floor(process.uptime() / 60)} minutos
  `);
  
  process.exit(0);
});