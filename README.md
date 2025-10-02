# WhatsApp Bot con Notificaciones Telegram

Este proyecto es un **bot de WhatsApp** que se conecta mediante `whatsapp-web.js`, permite enviar mensajes a números válidos, genera QR para autenticación y envía notificaciones de eventos críticos a Telegram.

---

## 📌 Características principales

- Conexión con **WhatsApp Web** usando `whatsapp-web.js` y `LocalAuth`.
- Generación automática de **código QR** para autenticación y reautenticación.
- Envío de mensajes a **múltiples números** mediante el endpoint `/send`.
- Verificación automática de números válidos y usuarios registrados en WhatsApp.
- Reconexión automática ante desconexiones o fallos.
- Notificaciones a **Telegram** ante:
  - Errores de autenticación
  - Necesidad de reautenticación (QR)
  - Desconexiones inesperadas
  - Errores críticos en envíos masivos
  - Inicio y cierre del servicio
- Endpoint `/clean-session` para **eliminar sesiones manualmente**.
- Seguridad:
  - Token Bearer para autorización en endpoints sensibles.
  - Rate limiting para prevenir abuso en envíos de mensajes.
- Logs claros en consola con información de estado y errores.

---

## Endpoints

### `GET /health`
Retorna el estado actual del servicio, incluyendo WhatsApp y Telegram.

---

### `GET /qr`
Obtiene el código QR para iniciar sesión en WhatsApp si es necesario.

---

### `POST /send`
Envía un mensaje de WhatsApp a uno o varios números válidos.

**URL:** `/send`  
**Método:** `POST`  
**Autorización:** Header `Authorization: Bearer <TOKEN>`  

**Body (JSON):**
```json
{
  "msg": "Hola, este es un mensaje de prueba",
  "numeros": ["5512345678", "5598765432"]
}
```

### `POST /clean-session` → Limpiar sesión de WhatsApp

---

## ⚙️ Requisitos y librerías

**Requisitos:**
- Node.js >= 18
- NPM >= 8 (o Yarn)
- Google Chrome o Chromium instalado en el servidor
---

## ⚙️ Librerías necesarias

**Dependencias a instalar:**

```bash
npm install express whatsapp-web.js qrcode-terminal axios node-telegram-bot-api helmet cors express-rate-limit dotenv
```

---

## Scripts

- `npm start` → Ejecuta el bot
- `npm run dev` → Ejecuta el bot con nodemon
