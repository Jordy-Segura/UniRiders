const nodemailer = require("nodemailer");
const { Resend } = require("resend");

const FALLBACK_FROM = "UniRiders <onboarding@resend.dev>";
const FROM = process.env.RESEND_FROM || FALLBACK_FROM;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

console.log("RESEND_FROM =", process.env.RESEND_FROM);

function normalizeEmailValue(value) {
    return value ? String(value).trim().toLowerCase() : "";
}

function isAllowedRecipient(email) {
    const normalized = normalizeEmailValue(email);
    return normalized.endsWith("@espoch.edu.ec");
}

const RATE_LIMIT_MS = 30000;
const recentEmails = new Map();

const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
        user: "jordy.segura@espoch.edu.ec",
        pass: "qgnxqkqdhykvkrzm"
    },
    tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

transporter.verify((error) => {
    if (error) {
        console.log("❌ Error configuración email:", error);
    } else {
        console.log("✅ Servidor de correo listo");
    }
});

async function sendWithResend({ to, subject, text }) {
    if (!resend) {
        return null;
    }

    const primary = await resend.emails.send({
        from: FROM,
        to,
        subject,
        text
    });

    if (!primary.error) {
        console.log("✅ Correo enviado (Resend):", primary.data?.id || "OK");
        return true;
    }

    console.log("❌ Error enviando correo (Resend):", primary.error);
    const errorMessage = typeof primary.error === "string" ? primary.error : JSON.stringify(primary.error);

    if (!errorMessage.includes("domain is not verified")) {
        return false;
    }

    const fallback = await resend.emails.send({
        from: FALLBACK_FROM,
        to,
        subject,
        text
    });

    if (!fallback.error) {
        console.log("✅ Correo enviado (Resend fallback):", fallback.data?.id || "OK");
        return true;
    }

    console.log("❌ Error enviando correo (Resend fallback):", fallback.error);
    return false;
}

async function sendWithSmtp({ to, subject, text }) {
    try {
        const info = await transporter.sendMail({
            from: FROM,
            to,
            subject,
            text,
            headers: {
                "X-Priority": "1",
                "X-MSMail-Priority": "High",
                "Importance": "high"
            }
        });
        console.log("✅ Correo enviado (SMTP):", info.messageId);
        return true;
    } catch (error) {
        console.log("❌ Error enviando correo (SMTP):", error);
        return false;
    }
}

async function sendEmail({ to, subject, text }) {
    if (resend) {
        try {
            const sent = await sendWithResend({ to, subject, text });
            if (sent !== null) {
                return sent;
            }
        } catch (error) {
            console.log("❌ Error enviando correo (Resend):", error);
        }
    }

    return sendWithSmtp({ to, subject, text });
}

async function sendRecoveryMail(to, code) {
    try {
        if (!isAllowedRecipient(to)) {
            console.log("❌ Correo no autorizado para notificaciones:", to);
            return false;
        }

        const now = Date.now();
        const lastSent = recentEmails.get(to);

        if (lastSent && now - lastSent < RATE_LIMIT_MS) {
            console.log("⏰ Rate limit alcanzado para:", to);
            return false;
        }

        recentEmails.set(to, now);

        const mailOptions = {
            to,
            subject: `Código de Verificación UniRiders - ${code}`,
            text: `Tu código de verificación para UniRiders es: ${code}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este código, ignora este mensaje.`
        };

        console.log("📧 Intentando enviar correo a:", to);
        const emailSent = await sendEmail(mailOptions);
        if (!emailSent) {
            return false;
        }

        setTimeout(() => {
            recentEmails.delete(to);
        }, 60 * 60 * 1000);

        return true;
    } catch (error) {
        console.log("❌ Error enviando correo:", error);
        recentEmails.delete(to);
        return false;
    }
}

async function sendVerificationMail(to, code) {
    return sendRecoveryMail(to, code);
}

async function sendAdminLoginMail(to, code) {
    try {
        const normalized = normalizeEmailValue(to);

        if (!normalized.endsWith("@gmail.com")) {
            console.log("❌ Correo de administrador no válido (debe ser Gmail):", to);
            return false;
        }

        const now = Date.now();
        const lastSent = recentEmails.get(to);

        if (lastSent && now - lastSent < RATE_LIMIT_MS) {
            console.log("⏰ Rate limit alcanzado para acceso administrador:", to);
            return false;
        }

        recentEmails.set(to, now);

        const mailOptions = {
            to,
            subject: `Código de acceso administrador - ${code}`,
            text: `Tu código de acceso administrador es: ${code}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este código, ignora este mensaje.`
        };

        const emailSent = await sendEmail(mailOptions);
        if (!emailSent) {
            return false;
        }

        setTimeout(() => {
            recentEmails.delete(to);
        }, 60 * 60 * 1000);

        return true;
    } catch (error) {
        console.log("❌ Error enviando código administrador:", error);
        recentEmails.delete(to);
        return false;
    }
}

module.exports = {
    sendRecoveryMail,
    sendVerificationMail,
    sendAdminLoginMail
};
