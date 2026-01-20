// backend/mailer.js
const { Resend } = require("resend");

function normalizeEmailValue(value) {
  return value ? String(value).trim().toLowerCase() : "";
}

function isAllowedRecipient(email) {
  const normalized = normalizeEmailValue(email);
  return normalized.endsWith("@espoch.edu.ec");
}

const RATE_LIMIT_MS = 30000;
const recentEmails = new Map();

// No crashear el servidor si falta la key
const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

const FROM = process.env.RESEND_FROM || "UniRiders <onboarding@resend.dev>";

async function sendEmail({ to, subject, text, html }) {
  if (!resend) {
    console.log("❌ RESEND_API_KEY no configurada en Render");
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
    });

    if (error) {
      console.log("❌ Error Resend:", error);
      return false;
    }

    console.log("✅ Correo enviado (Resend):", data?.id);
    return true;
  } catch (err) {
    console.log("❌ Error enviando correo (Resend):", err?.message || err);
    return false;
  }
}

async function sendRecoveryMail(to, code) {
  // Restringe a correos ESPOCH (tu lógica)
  if (!isAllowedRecipient(to)) {
    console.log("❌ Correo no autorizado:", to);
    return false;
  }

  const now = Date.now();
  const lastSent = recentEmails.get(to);
  if (lastSent && now - lastSent < RATE_LIMIT_MS) {
    console.log("⏰ Rate limit alcanzado para:", to);
    return false;
  }
  recentEmails.set(to, now);

  const subject = `Código de Verificación UniRiders - ${code}`;
  const text = `Tu código de verificación para UniRiders es: ${code}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este código, ignora este mensaje.`;

  const html = `<h2>UniRiders</h2><p>Tu código es: <b>${code}</b></p><p>Expira en 10 minutos.</p>`;

  console.log("📧 (Resend) Enviando correo a:", to);
  const ok = await sendEmail({ to, subject, text, html });

  // Limpieza de cache
  setTimeout(() => recentEmails.delete(to), 60 * 60 * 1000);
  if (!ok) recentEmails.delete(to);

  return ok;
}

async function sendVerificationMail(to, code) {
  return sendRecoveryMail(to, code);
}

async function sendAdminLoginMail(to, code) {
  // tu regla de admin (si la quieres mantener)
  const normalized = normalizeEmailValue(to);
  if (!normalized.endsWith("@gmail.com")) {
    console.log("❌ Admin debe ser Gmail:", to);
    return false;
  }

  const subject = `Código de acceso administrador - ${code}`;
  const text = `Tu código de acceso administrador es: ${code}\n\nExpira en 10 minutos.`;

  return sendEmail({ to, subject, text, html: `<p>Código admin: <b>${code}</b></p>` });
}

module.exports = {
  sendRecoveryMail,
  sendVerificationMail,
  sendAdminLoginMail,
};
