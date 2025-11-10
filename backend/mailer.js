const nodemailer = require("nodemailer");

// Configuración para Outlook/Office 365 (ESPOCH)
const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
        user: "jordy.segura@espoch.edu.ec",
        pass: "qgnxqkqdhykvkrzm"
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

// Cache para controlar envíos
const recentEmails = new Map();
const RATE_LIMIT_MS = 30000;

// Verificar configuración del transporter
transporter.verify(function (error, success) {
    if (error) {
        console.log('❌ Error configuración email:', error);
    } else {
        console.log('✅ Servidor de correo listo');
    }
});

async function sendRecoveryMail(to, code) {
    try {
        // Verificar que sea correo ESPOCH
        if (!to.endsWith('@espoch.edu.ec')) {
            console.log('❌ Correo no ESPOCH:', to);
            return false;
        }

        // Verificar rate limiting
        const now = Date.now();
        const lastSent = recentEmails.get(to);
        
        if (lastSent && (now - lastSent) < RATE_LIMIT_MS) {
            console.log('⏰ Rate limit alcanzado para:', to);
            return false;
        }
        
        recentEmails.set(to, now);

        const mailOptions = {
            from: {
                name: 'UniRiders ESPOCH',
                address: 'jordy.segura@espoch.edu.ec'
            },
            to: to,
            subject: `Código de Verificación UniRiders - ${code}`,
            text: `Tu código de verificación para UniRiders es: ${code}\n\nEste código expira en 10 minutos.\n\nSi no solicitaste este código, ignora este mensaje.`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #e1e5e9; }
        .header { background: linear-gradient(135deg, #0078d4, #00bcf2); padding: 25px 20px; text-align: center; color: white; }
        .content { padding: 25px 20px; }
        .code-box { background: #f3f2f1; padding: 20px; border-radius: 6px; border: 2px solid #0078d4; text-align: center; margin: 20px 0; }
        .warning { background: #fff4ce; border: 1px solid #ffaa44; border-radius: 4px; padding: 15px; margin: 20px 0; }
        .footer { background: #f3f2f1; padding: 15px; text-align: center; border-top: 1px solid #d2d0ce; color: #605e5c; }
        .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🚗 UniRiders</div>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Plataforma de Movilidad Estudiantil - ESPOCH</p>
        </div>
        
        <div class="content">
            <h2 style="color: #323130; text-align: center; margin-bottom: 15px;">Verificación de Cuenta</h2>
            <p style="color: #605e5c; text-align: center; font-size: 16px; line-height: 1.5;">
                Hola estudiante ESPOCH,<br>
                Para completar tu registro en UniRiders, utiliza el siguiente código:
            </p>
            
            <div class="code-box">
                <div style="font-size: 14px; color: #605e5c; margin-bottom: 8px;">CÓDIGO DE VERIFICACIÓN</div>
                <h1 style="margin: 0; color: #0078d4; font-size: 32px; letter-spacing: 6px; font-weight: 600; font-family: 'Consolas', monospace;">${code}</h1>
            </div>
            
            <div class="warning">
                <p style="margin: 0; color: #8a5500; font-size: 14px; line-height: 1.4;">
                    <strong>📋 Información importante:</strong><br>
                    • Este código expira en 10 minutos<br>
                    • Es de un solo uso<br>
                    • Si no reconoces esta solicitud, ignora este mensaje
                </p>
            </div>
            
            <p style="color: #8a8886; text-align: center; font-size: 12px; margin-top: 25px; line-height: 1.4;">
                Este es un mensaje automático del sistema UniRiders - ESPOCH<br>
                Por favor no respondas a este correo.
            </p>
        </div>
        
        <div class="footer">
            <p style="margin: 0; font-size: 11px;">
                © 2024 UniRiders - Escuela Superior Politécnica de Chimborazo<br>
                Sistema de transporte seguro para la comunidad estudiantil
            </p>
        </div>
    </div>
</body>
</html>
            `,
            headers: {
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'high'
            }
        };

        console.log('📧 Intentando enviar correo a:', to);
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Correo enviado:', info.messageId);
        
        // Limpiar cache después de 1 hora
        setTimeout(() => {
            recentEmails.delete(to);
        }, 60 * 60 * 1000);

        return true;
        
    } catch (error) {
        console.log('❌ Error enviando correo:', error);
        recentEmails.delete(to);
        return false;
    }
}

async function sendVerificationMail(to, code) {
    return await sendRecoveryMail(to, code);
}

module.exports = { 
    sendRecoveryMail, 
    sendVerificationMail 
};