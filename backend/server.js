// Agrega estas variables globales al inicio del server.js
const connectedUsers = new Map();
const typingUsers = new Map();
const verificationCodes = new Map();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sql, poolPromise } = require("./db");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendRecoveryMail, sendVerificationMail, sendAdminLoginMail } = require('./mailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }
});

const API_PORT = 3000;

// Variables globales con datos reales
const globalTripOffers = [];
const globalActiveTrips = {};
const globalChatMessages = {};
const driverLocations = new Map();
const passengerLocations = new Map();
const appStatistics = {
    totalUsers: 0,
    activeTrips: 0,
    completedTrips: 0,
    activeUsers: 0,
    totalEarnings: 0
};

const DEFAULT_ADMIN_EMAIL = 'marcelojmsp@gmail.com';
const DEFAULT_ADMIN_EMAIL_LOWER = DEFAULT_ADMIN_EMAIL.toLowerCase();
const DEFAULT_ADMIN_PHONE = process.env.DEFAULT_ADMIN_PHONE || '';

const PUBLIC_REGISTRATION_ROLES = ['pasajero', 'conductor'];
const ADMIN_MANAGEABLE_ROLES = ['pasajero', 'conductor', 'administrador'];

function normalizeEmail(email) {
    return email ? String(email).trim().toLowerCase() : '';
}

function isGmailEmail(email) {
    return normalizeEmail(email).endsWith('@gmail.com');
}

function sanitizePhoneNumber(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, "");
    return digits.length ? digits : null;
}

function requireAdmin(req, res, next) {
    const role = req.headers['user-role'];

    if (role !== 'administrador') {
        return res.status(403).json({ message: "Solo los administradores pueden acceder a esta función" });
    }

    next();
}

async function ensureAdminInfrastructure() {
    try {
        const pool = await poolPromise;

        await pool.request().query(`
            IF COL_LENGTH('Usuarios', 'telefono_whatsapp') IS NULL
            BEGIN
                ALTER TABLE Usuarios ADD telefono_whatsapp NVARCHAR(30) NULL;
            END
        `);

        await pool.request().query(`
            IF OBJECT_ID('dbo.Tarifas', 'U') IS NULL
            BEGIN
                CREATE TABLE Tarifas (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    nombre NVARCHAR(120) NOT NULL,
                    descripcion NVARCHAR(255) NULL,
                    precio DECIMAL(10,2) NOT NULL,
                    activo BIT NOT NULL DEFAULT 1,
                    fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
                    creado_por NVARCHAR(150) NULL
                );
            END
        `);

        await pool.request().query(`
            IF OBJECT_ID('dbo.AlertasEmergencia', 'U') IS NULL
            BEGIN
                CREATE TABLE AlertasEmergencia (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    usuario_email NVARCHAR(150) NOT NULL,
                    mensaje NVARCHAR(500) NULL,
                    ubicacion_lat DECIMAL(10,6) NULL,
                    ubicacion_lon DECIMAL(10,6) NULL,
                    trip_id INT NULL,
                    atendido BIT NOT NULL DEFAULT 0,
                    fecha DATETIME NOT NULL DEFAULT GETDATE(),
                    atendido_por NVARCHAR(150) NULL
                );
            END
        `);

        const adminCheck = await pool.request()
            .input('email', sql.NVarChar, DEFAULT_ADMIN_EMAIL_LOWER)
            .query(`SELECT TOP 1 nombre, email, rol, telefono_whatsapp FROM Usuarios WHERE LOWER(email) = @email`);

        if (adminCheck.recordset.length === 0) {
            const tempPassword = crypto.randomBytes(12).toString('hex');
            const hashedPassword = await bcrypt.hash(tempPassword, 10);
            const normalizedPhone = sanitizePhoneNumber(DEFAULT_ADMIN_PHONE);

            await pool.request()
                .input('nombre', sql.NVarChar, 'Administrador Principal')
                .input('email', sql.NVarChar, DEFAULT_ADMIN_EMAIL_LOWER)
                .input('password', sql.NVarChar, hashedPassword)
                .input('telefono', sql.NVarChar, normalizedPhone || null)
                .query(`
                    INSERT INTO Usuarios (nombre, email, password, rol, metodo_pago_pref, telefono_whatsapp)
                    VALUES (@nombre, @email, @password, 'administrador', 'Efectivo', @telefono)
                `);

            console.log(`Se creó automáticamente la cuenta del administrador maestro (${DEFAULT_ADMIN_EMAIL}). Usa el acceso con código para ingresar.`);
        } else {
            const currentAdmin = adminCheck.recordset[0];
            if (currentAdmin.rol !== 'administrador') {
                await pool.request()
                    .input('email', sql.NVarChar, DEFAULT_ADMIN_EMAIL_LOWER)
                    .query(`UPDATE Usuarios SET rol = 'administrador' WHERE LOWER(email) = @email`);
            }

            if (DEFAULT_ADMIN_PHONE) {
                const normalizedPhone = sanitizePhoneNumber(DEFAULT_ADMIN_PHONE);
                if (normalizedPhone && normalizedPhone !== currentAdmin.telefono_whatsapp) {
                    await pool.request()
                        .input('email', sql.NVarChar, DEFAULT_ADMIN_EMAIL_LOWER)
                        .input('telefono', sql.NVarChar, normalizedPhone)
                        .query(`UPDATE Usuarios SET telefono_whatsapp = @telefono WHERE LOWER(email) = @email`);
                }
            }
        }

    } catch (infraErr) {
        console.log('Error asegurando infraestructura de administrador:', infraErr);
    }
}

// =========================================================
// FUNCIONES AUXILIARES MEJORADAS
// =========================================================

// Función para actualizar estadísticas en tiempo real
async function updateRealTimeStats() {
    try {
        const pool = await poolPromise;
        
        // Contar usuarios activos (últimos 5 minutos)
        const activeUsersResult = await pool.request()
            .query(`
                SELECT COUNT(DISTINCT email) as active_users 
                FROM (
                    SELECT pasajero_email as email FROM Viajes 
                    WHERE fecha_solicitud > DATEADD(MINUTE, -5, GETDATE())
                    UNION 
                    SELECT conductor_email as email FROM Viajes 
                    WHERE fecha_aceptacion > DATEADD(MINUTE, -5, GETDATE())
                ) as usuarios_activos
            `);
        
        const activeUsers = activeUsersResult.recordset[0]?.active_users || 0;
        
        // Contar viajes activos
        const activeTripsResult = await pool.request()
            .query("SELECT COUNT(*) as active_trips FROM Viajes WHERE estado = 'ACEPTADO'");
        
        const activeTrips = activeTripsResult.recordset[0]?.active_trips || 0;
        
        // Contar viajes completados hoy
        const completedTodayResult = await pool.request()
            .query("SELECT COUNT(*) as completed_today FROM Viajes WHERE estado = 'COMPLETADO' AND CAST(fecha_finalizacion AS DATE) = CAST(GETDATE() AS DATE)");
        
        const completedToday = completedTodayResult.recordset[0]?.completed_today || 0;
        
        // Actualizar tabla de estadísticas
        await pool.request()
            .query(`
                UPDATE EstadisticasApp SET 
                usuarios_activos = ${activeUsers},
                viajes_activos = ${activeTrips},
                viajes_completados = (SELECT COUNT(*) FROM Viajes WHERE estado = 'COMPLETADO'),
                ingresos_totales = (SELECT ISNULL(SUM(costo), 0) FROM Viajes WHERE estado = 'COMPLETADO'),
                ultima_actualizacion = GETDATE()
            `);
            
        return { activeUsers, activeTrips, completedToday };
        
    } catch (err) {
        console.log('Error actualizando estadísticas:', err);
        return { activeUsers: 5, activeTrips: 0, completedToday: 0 };
    }
}

// Función para obtener historial de viajes - CORREGIDA
async function getTripHistory(email, role) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return [];
    }

    try {
        const pool = await poolPromise;
        let query;

        if (role === 'conductor') {
            query = `
                SELECT TOP 10 id_viaje, pasajero_email, origen, destino, estado, costo,
                       fecha_solicitud, fecha_aceptacion, fecha_finalizacion, calificacion_pasajero
                FROM Viajes
                WHERE LOWER(conductor_email) = @email
                ORDER BY fecha_solicitud DESC
            `;
        } else {
            query = `
                SELECT TOP 10 id_viaje, conductor_email, origen, destino, estado, costo,
                       fecha_solicitud, fecha_aceptacion, fecha_finalizacion, calificacion_conductor
                FROM Viajes
                WHERE LOWER(pasajero_email) = @email
                ORDER BY fecha_solicitud DESC
            `;
        }

        const result = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query(query);
            
        return result.recordset;
    } catch (err) {
        console.log('Error obteniendo historial:', err);
        return [];
    }
}

// Inicializar estadísticas al iniciar el servidor
async function initializeStatistics() {
    try {
        const pool = await poolPromise;
        
        // Obtener estadísticas reales de usuarios
        const usersResult = await pool.request()
            .query("SELECT COUNT(*) as totalUsers FROM Usuarios");
        
        appStatistics.totalUsers = usersResult.recordset[0].totalUsers;
        
        // Intentar obtener estadísticas de viajes si las tablas existen
        try {
            const tripsResult = await pool.request()
                .query("SELECT COUNT(*) as completedTrips FROM Viajes WHERE estado = 'COMPLETADO'");
            appStatistics.completedTrips = tripsResult.recordset[0].completedTrips || 0;
        } catch (err) {
            // Si no existe la tabla Viajes, usar valores por defecto
            appStatistics.completedTrips = Math.floor(appStatistics.totalUsers * 2.5);
        }
        
        try {
            const earningsResult = await pool.request()
                .query("SELECT ISNULL(SUM(costo), 0) as totalEarnings FROM Viajes WHERE estado = 'COMPLETADO'");
            appStatistics.totalEarnings = earningsResult.recordset[0].totalEarnings || 0;
        } catch (err) {
            // Si no existe la columna costo, calcular basado en viajes completados
            appStatistics.totalEarnings = appStatistics.completedTrips * 3.5;
        }
        
    } catch (err) {
        console.log('Error inicializando estadísticas, usando valores por defecto');
        // Valores por defecto basados en usuarios registrados
        appStatistics.totalUsers = appStatistics.totalUsers || 50;
        appStatistics.completedTrips = appStatistics.completedTrips || Math.floor(appStatistics.totalUsers * 2.5);
        appStatistics.totalEarnings = appStatistics.totalEarnings || (appStatistics.completedTrips * 3.5);
    }
}

function parseCoordinateString(coordString) {
    if (!coordString) return null;
    const matches = String(coordString).match(/-?\d+(?:\.\d+)?/g);
    if (!matches || matches.length < 2) {
        return null;
    }
    return {
        lat: parseFloat(matches[0]),
        lon: parseFloat(matches[1])
    };
}

// =========================================================
// RUTAS DE AUTENTICACIÓN Y VERIFICACIÓN
// =========================================================

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function validateEspochEmail(req, res, next) {
    const rawEmail = req.body.email;
    const email = rawEmail ? String(rawEmail).trim() : '';
    if (!email) {
        return res.status(400).json({ message: "El correo es obligatorio" });
    }

    req.body.email = email;
    const normalizedEmail = email.toLowerCase();

    if (!normalizedEmail.endsWith('@espoch.edu.ec')) {
        return res.status(400).json({
            message: "Solo se permiten correos institucionales @espoch.edu.ec"
        });
    }
    next();
}

app.post("/api/register", validateEspochEmail, async (req, res) => {
    const { name, password, confirm } = req.body;
    let { email, role } = req.body;

    email = email ? email.trim() : '';
    const normalizedEmail = normalizeEmail(email);
    if (!name || !email || !password || !confirm || !role) {
        return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }
    if (password !== confirm) {
        return res.status(400).json({ message: "Las contraseñas no coinciden" });
    }

    if (!PUBLIC_REGISTRATION_ROLES.includes(role)) {
        return res.status(400).json({ message: "Rol no permitido" });
    }

    try {
        const pool = await poolPromise;

        const userCheck = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT email FROM Usuarios WHERE LOWER(email) = @email");

        if (userCheck.recordset.length > 0) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }

        const targetRole = isMasterAdmin ? 'administrador' : role;
        const verificationCode = generateVerificationCode();
        verificationCodes.set(normalizedEmail, {
            code: verificationCode,
            expires: Date.now() + 10 * 60 * 1000,
            userData: { name, email: normalizedEmail, password, role }
        });

        const emailSent = await sendVerificationMail(email, verificationCode);

        if (!emailSent) {
            verificationCodes.delete(normalizedEmail);
            return res.status(500).json({
                message: "Error al enviar código de verificación. Intenta nuevamente."
            });
        }

        res.status(200).json({
            message: "Código de verificación enviado a tu correo electrónico",
            requiresVerification: true
        });

    } catch (err) {
        verificationCodes.delete(normalizedEmail);
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.post("/api/verify-registration", async (req, res) => {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmail(email);

    try {
        const verificationData = verificationCodes.get(normalizedEmail);

        if (!verificationData) {
            return res.status(400).json({ message: "Código no válido o expirado" });
        }

        if (Date.now() > verificationData.expires) {
            verificationCodes.delete(normalizedEmail);
            return res.status(400).json({ message: "El código ha expirado" });
        }

        if (verificationData.code !== code) {
            return res.status(400).json({ message: "Código incorrecto" });
        }

        const { name, password, role, phone } = verificationData.userData;
        const pool = await poolPromise;
        let passwordToHash = password;

        if (!passwordToHash) {
            passwordToHash = crypto.randomBytes(12).toString('hex');
        }

        const hashedPassword = await bcrypt.hash(passwordToHash, 10);

        await pool.request()
            .input("nombre", sql.NVarChar, name)
            .input("email", sql.NVarChar, normalizedEmail)
            .input("password", sql.NVarChar, hashedPassword)
            .input("rol", sql.NVarChar, role)
            .input("telefono", sql.NVarChar, phone || null)
            .query(`INSERT INTO Usuarios (nombre, email, password, rol, metodo_pago_pref, telefono_whatsapp) VALUES (@nombre, @email, @password, @rol, 'Efectivo', @telefono)`);

        // Actualizar estadísticas
        appStatistics.totalUsers++;
        appStatistics.activeUsers++;

        verificationCodes.delete(normalizedEmail);

        res.status(201).json({
            message: "Usuario registrado exitosamente. Ya puedes iniciar sesión."
        });

    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos" });
    }

    try {
        const pool = await poolPromise;
        const normalizedEmail = normalizeEmail(email);

        const result = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT nombre, email, password, rol FROM Usuarios WHERE LOWER(email) = @email");

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Credenciales incorrectas" });
        }

        const user = result.recordset[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Credenciales incorrectas" });
        }

        // Actualizar usuario activo
        appStatistics.activeUsers++;

        res.json({ 
            message: "Login exitoso", 
            userEmail: user.email,
            userName: user.nombre,
            role: user.rol
        });

    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.post("/api/admin/request-code", async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !isGmailEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Solo se permiten correos Gmail para administradores" });
    }

    try {
        const pool = await poolPromise;
        const adminLookup = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT nombre FROM Usuarios WHERE LOWER(email) = @email AND rol = 'administrador'");

        if (adminLookup.recordset.length === 0) {
            return res.status(404).json({ message: "No existe un administrador registrado con este correo" });
        }

        const verificationCode = generateVerificationCode();
        verificationCodes.set(normalizedEmail, {
            code: verificationCode,
            expires: Date.now() + 10 * 60 * 1000,
            type: 'admin-login',
            userName: adminLookup.recordset[0].nombre || 'Administrador'
        });

        const emailSent = await sendAdminLoginMail(email, verificationCode);

        if (!emailSent) {
            verificationCodes.delete(normalizedEmail);
            return res.status(500).json({ message: "No se pudo enviar el código. Intenta nuevamente." });
        }

        res.json({ message: "Código de acceso enviado al correo del administrador" });
    } catch (err) {
        verificationCodes.delete(normalizedEmail);
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.post("/api/admin/verify-code", async (req, res) => {
    const { email, code } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code) {
        return res.status(400).json({ message: "Correo y código son obligatorios" });
    }

    const verificationData = verificationCodes.get(normalizedEmail);

    if (!verificationData || verificationData.type !== 'admin-login') {
        return res.status(400).json({ message: "Código inválido o expirado" });
    }

    if (Date.now() > verificationData.expires) {
        verificationCodes.delete(normalizedEmail);
        return res.status(400).json({ message: "El código ha expirado" });
    }

    if (verificationData.code !== code) {
        return res.status(400).json({ message: "Código incorrecto" });
    }

    try {
        const pool = await poolPromise;
        const adminLookup = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT nombre, email FROM Usuarios WHERE LOWER(email) = @email AND rol = 'administrador'");

        if (adminLookup.recordset.length === 0) {
            verificationCodes.delete(normalizedEmail);
            return res.status(404).json({ message: "No existe un administrador registrado con este correo" });
        }

        const adminRecord = adminLookup.recordset[0];
        verificationCodes.delete(normalizedEmail);

        res.json({
            message: "Acceso concedido",
            userEmail: adminRecord.email,
            userName: adminRecord.nombre || 'Administrador',
            role: 'administrador'
        });
    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

// ----------------------------------------------------------------
// RECUPERACIÓN DE CONTRASEÑA
// ----------------------------------------------------------------

app.post("/api/recover", validateEspochEmail, async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    try {
        const pool = await poolPromise;

        const userCheck = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT email FROM Usuarios WHERE LOWER(email) = @email");

        if (userCheck.recordset.length === 0) {
            return res.status(404).json({
                message: "No existe una cuenta con este correo registrado"
            });
        }

        const recoveryCode = generateVerificationCode();
        verificationCodes.set(normalizedEmail, {
            code: recoveryCode,
            expires: Date.now() + 10 * 60 * 1000,
            type: 'recovery'
        });

        const emailSent = await sendRecoveryMail(email, recoveryCode);

        if (!emailSent) {
            verificationCodes.delete(normalizedEmail);
            return res.status(500).json({
                message: "Error al enviar código de recuperación. Intenta nuevamente."
            });
        }

        res.json({
            message: "Código de recuperación enviado a tu correo electrónico"
        });

    } catch (err) {
        verificationCodes.delete(normalizedEmail);
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.post("/api/reset", async (req, res) => {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !code || !newPassword) {
        return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    try {
        const verificationData = verificationCodes.get(normalizedEmail);

        if (!verificationData || verificationData.type !== 'recovery') {
            return res.status(400).json({ message: "Código no válido o expirado" });
        }

        if (Date.now() > verificationData.expires) {
            verificationCodes.delete(normalizedEmail);
            return res.status(400).json({ message: "El código ha expirado" });
        }

        if (verificationData.code !== code) {
            return res.status(400).json({ message: "Código incorrecto" });
        }

        const pool = await poolPromise;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .input("password", sql.NVarChar, hashedPassword)
            .query("UPDATE Usuarios SET password = @password WHERE LOWER(email) = @email");

        verificationCodes.delete(normalizedEmail);

        res.json({
            message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión."
        });

    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

// =========================================================
// ADMINISTRACIÓN
// =========================================================

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`SELECT nombre, email, rol, metodo_pago_pref, telefono_whatsapp FROM Usuarios ORDER BY nombre`);

        const users = result.recordset.map(user => ({
            name: user.nombre,
            email: user.email,
            role: user.rol,
            paymentMethod: user.metodo_pago_pref,
            whatsapp: user.telefono_whatsapp
        }));

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener usuarios" });
    }
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const { name, email, password, role = 'pasajero', whatsapp, paymentMethod = 'Efectivo' } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail) {
        return res.status(400).json({ message: "Nombre y correo son obligatorios" });
    }

    if (!ADMIN_MANAGEABLE_ROLES.includes(role)) {
        return res.status(400).json({ message: "Rol no permitido" });
    }

    if (role === 'administrador') {
        if (!isGmailEmail(normalizedEmail)) {
            return res.status(400).json({ message: "Los administradores deben registrarse con correos Gmail" });
        }
    } else {
        if (!normalizedEmail.endsWith('@espoch.edu.ec')) {
            return res.status(400).json({ message: "Solo se permiten correos @espoch.edu.ec" });
        }

        if (!password) {
            return res.status(400).json({ message: "La contraseña es obligatoria para este rol" });
        }
    }

    try {
        const pool = await poolPromise;

        const existing = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT email FROM Usuarios WHERE LOWER(email) = @email");

        if (existing.recordset.length > 0) {
            return res.status(409).json({ message: "El usuario ya existe" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const normalizedPhone = sanitizePhoneNumber(whatsapp);

        await pool.request()
            .input("nombre", sql.NVarChar, name)
            .input("email", sql.NVarChar, normalizedEmail)
            .input("password", sql.NVarChar, hashedPassword)
            .input("rol", sql.NVarChar, role)
            .input("metodo", sql.NVarChar, paymentMethod)
            .input("telefono", sql.NVarChar, normalizedPhone || null)
            .query(`
                INSERT INTO Usuarios (nombre, email, password, rol, metodo_pago_pref, telefono_whatsapp)
                VALUES (@nombre, @email, @password, @rol, @metodo, @telefono)
            `);

        res.status(201).json({ message: "Usuario creado correctamente" });
    } catch (err) {
        res.status(500).json({ message: "Error al crear usuario" });
    }
});

app.patch("/api/admin/users/:email", requireAdmin, async (req, res) => {
    const targetEmail = req.params.email;
    const normalizedTargetEmail = normalizeEmail(targetEmail);
    const { name, role, whatsapp, paymentMethod } = req.body;

    if (role && !ADMIN_MANAGEABLE_ROLES.includes(role)) {
        return res.status(400).json({ message: "Rol no permitido" });
    }

    if (role === 'administrador' && !isGmailEmail(normalizedTargetEmail)) {
        return res.status(400).json({ message: "Los administradores deben utilizar correos Gmail" });
    }

    if (normalizedTargetEmail === DEFAULT_ADMIN_EMAIL_LOWER && role && role !== 'administrador') {
        return res.status(400).json({ message: "No se puede cambiar el rol del administrador maestro" });
    }

    try {
        const pool = await poolPromise;
        const updates = [];
        const request = pool.request().input("email", sql.NVarChar, normalizedTargetEmail);

        if (name !== undefined) {
            updates.push("nombre = @nombre");
            request.input("nombre", sql.NVarChar, name);
        }

        if (role !== undefined) {
            updates.push("rol = @rol");
            request.input("rol", sql.NVarChar, role);
        }

        if (paymentMethod !== undefined) {
            updates.push("metodo_pago_pref = @metodo");
            request.input("metodo", sql.NVarChar, paymentMethod);
        }

        if (whatsapp !== undefined) {
            updates.push("telefono_whatsapp = @telefono");
            request.input("telefono", sql.NVarChar, sanitizePhoneNumber(whatsapp));
        }

        if (!updates.length) {
            return res.status(400).json({ message: "No hay cambios para aplicar" });
        }

        const updateQuery = `UPDATE Usuarios SET ${updates.join(', ')} WHERE LOWER(email) = @email`;
        const result = await request.query(updateQuery);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json({ message: "Usuario actualizado" });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar usuario" });
    }
});

app.delete("/api/admin/users/:email", requireAdmin, async (req, res) => {
    const targetEmail = req.params.email;
    const adminEmail = req.headers['user-email'];
    const normalizedTargetEmail = normalizeEmail(targetEmail);
    const normalizedAdminEmail = normalizeEmail(adminEmail);

    if (normalizedTargetEmail === normalizedAdminEmail) {
        return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    if (normalizedTargetEmail === DEFAULT_ADMIN_EMAIL_LOWER) {
        return res.status(400).json({ message: "No se puede eliminar la cuenta del administrador maestro" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("email", sql.NVarChar, normalizedTargetEmail)
            .query("DELETE FROM Usuarios WHERE LOWER(email) = @email");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json({ message: "Usuario eliminado" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar usuario" });
    }
});

app.get("/api/admin/pricing", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT id, nombre, descripcion, precio, activo, fecha_creacion
            FROM Tarifas
            ORDER BY activo DESC, nombre ASC
        `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener tarifas" });
    }
});

app.post("/api/admin/pricing", requireAdmin, async (req, res) => {
    const { nombre, descripcion, precio, activo = true } = req.body;
    const adminEmail = req.headers['user-email'];

    if (!nombre || precio === undefined) {
        return res.status(400).json({ message: "Nombre y precio son obligatorios" });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input("nombre", sql.NVarChar, nombre)
            .input("descripcion", sql.NVarChar, descripcion || null)
            .input("precio", sql.Decimal(10,2), parseFloat(precio))
            .input("activo", sql.Bit, activo ? 1 : 0)
            .input("creado_por", sql.NVarChar, adminEmail || null)
            .query(`
                INSERT INTO Tarifas (nombre, descripcion, precio, activo, creado_por)
                VALUES (@nombre, @descripcion, @precio, @activo, @creado_por)
            `);

        res.status(201).json({ message: "Tarifa creada" });
    } catch (err) {
        res.status(500).json({ message: "Error al crear tarifa" });
    }
});

app.put("/api/admin/pricing/:id", requireAdmin, async (req, res) => {
    const tariffId = parseInt(req.params.id);
    const { nombre, descripcion, precio, activo } = req.body;

    if (Number.isNaN(tariffId)) {
        return res.status(400).json({ message: "Tarifa inválida" });
    }

    try {
        const pool = await poolPromise;
        const updates = [];
        const request = pool.request().input("id", sql.Int, tariffId);

        if (nombre !== undefined) {
            updates.push("nombre = @nombre");
            request.input("nombre", sql.NVarChar, nombre);
        }

        if (descripcion !== undefined) {
            updates.push("descripcion = @descripcion");
            request.input("descripcion", sql.NVarChar, descripcion || null);
        }

        if (precio !== undefined) {
            updates.push("precio = @precio");
            request.input("precio", sql.Decimal(10,2), parseFloat(precio));
        }

        if (activo !== undefined) {
            updates.push("activo = @activo");
            request.input("activo", sql.Bit, activo ? 1 : 0);
        }

        if (!updates.length) {
            return res.status(400).json({ message: "No hay cambios para aplicar" });
        }

        const result = await request.query(`UPDATE Tarifas SET ${updates.join(', ')} WHERE id = @id`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Tarifa no encontrada" });
        }

        res.json({ message: "Tarifa actualizada" });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar tarifa" });
    }
});

app.delete("/api/admin/pricing/:id", requireAdmin, async (req, res) => {
    const tariffId = parseInt(req.params.id);

    if (Number.isNaN(tariffId)) {
        return res.status(400).json({ message: "Tarifa inválida" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("id", sql.Int, tariffId)
            .query("DELETE FROM Tarifas WHERE id = @id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Tarifa no encontrada" });
        }

        res.json({ message: "Tarifa eliminada" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar tarifa" });
    }
});

app.get("/api/admin/emergencies", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT id, usuario_email, mensaje, ubicacion_lat, ubicacion_lon, atendido, fecha, atendido_por, trip_id
            FROM AlertasEmergencia
            ORDER BY fecha DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener emergencias" });
    }
});

app.post("/api/admin/emergencies/:id/resolve", requireAdmin, async (req, res) => {
    const emergencyId = parseInt(req.params.id);
    const adminEmail = req.headers['user-email'];

    if (Number.isNaN(emergencyId)) {
        return res.status(400).json({ message: "Emergencia inválida" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("id", sql.Int, emergencyId)
            .input("adminEmail", sql.NVarChar, adminEmail || null)
            .query(`
                UPDATE AlertasEmergencia
                SET atendido = 1, atendido_por = @adminEmail
                WHERE id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Emergencia no encontrada" });
        }

        res.json({ message: "Emergencia marcada como atendida" });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar emergencia" });
    }
});

app.get("/api/admin/driver-locations", requireAdmin, async (req, res) => {
    try {
        const driverEmails = Array.from(driverLocations.keys());
        const response = [];

        let namesMap = new Map();

        if (driverEmails.length > 0) {
            const pool = await poolPromise;
            const request = pool.request();
            const placeholders = driverEmails.map((_, idx) => `@email${idx}`).join(', ');
            driverEmails.forEach((email, idx) => {
                request.input(`email${idx}`, sql.NVarChar, email);
            });

            const result = await request.query(`SELECT email, nombre FROM Usuarios WHERE email IN (${placeholders})`);
            result.recordset.forEach(row => namesMap.set(row.email, row.nombre));
        }

        driverEmails.forEach(email => {
            const location = driverLocations.get(email);
            const isBusy = Object.values(globalActiveTrips).some(trip => {
                if (!trip) return false;
                const driverEmail = trip.driverEmail || trip.conductor_email || trip.driver;
                const status = trip.status || trip.estado;
                if (!driverEmail) return false;
                if (driverEmail !== email) return false;
                return status && status !== 'FINALIZADO';
            });

            response.push({
                email,
                name: namesMap.get(email) || email,
                lat: location.lat,
                lon: location.lon,
                available: !isBusy,
                lastUpdate: location.timestamp
            });
        });

        res.json(response);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener ubicaciones" });
    }
});

app.post("/api/resend-verification", validateEspochEmail, async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    try {
        const verificationData = verificationCodes.get(normalizedEmail);

        if (verificationData && Date.now() < verificationData.expires) {
            const emailSent = await sendVerificationMail(email, verificationData.code);

            if (!emailSent) {
                return res.status(500).json({
                    message: "Error al reenviar código. Intenta nuevamente."
                });
            }

            return res.json({
                message: "Código reenviado a tu correo electrónico"
            });
        }

        const verificationCode = generateVerificationCode();
        verificationCodes.set(normalizedEmail, {
            code: verificationCode,
            expires: Date.now() + 10 * 60 * 1000,
            type: 'verification'
        });

        const emailSent = await sendVerificationMail(email, verificationCode);

        if (!emailSent) {
            verificationCodes.delete(normalizedEmail);
            return res.status(500).json({
                message: "Error al enviar código. Intenta nuevamente."
            });
        }

        res.json({
            message: "Código de verificación enviado a tu correo electrónico"
        });

    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

// =========================================================
// RUTAS NUEVAS Y MEJORADAS
// =========================================================

// Ruta para estadísticas en tiempo real mejorada
app.get("/api/stats/overview", async (req, res) => {
    try {
        const realStats = await updateRealTimeStats();
        const pool = await poolPromise;
        
        const totalUsersResult = await pool.request()
            .query("SELECT COUNT(*) as total_users FROM Usuarios");
        
        const totalUsers = totalUsersResult.recordset[0]?.total_users || 0;
        
        res.json({
            totalUsers: totalUsers,
            activeTrips: realStats.activeTrips,
            completedTrips: realStats.completedToday,
            activeUsers: realStats.activeUsers,
            totalEarnings: 0 // Se calculará automáticamente
        });
    } catch (err) {
        res.json({
            totalUsers: 50,
            activeTrips: 0,
            completedTrips: 25,
            activeUsers: 5,
            totalEarnings: 87.50
        });
    }
});

// Ruta para obtener historial de viajes
app.get("/api/trips/history", async (req, res) => {
    const userEmail = req.headers['user-email'];
    const userRole = req.headers['user-role'];
    
    if (!userEmail || !userRole) {
        return res.status(400).json({ message: "Datos de usuario requeridos" });
    }
    
    try {
        const history = await getTripHistory(userEmail, userRole);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: "Error obteniendo historial" });
    }
});

// Ruta para obtener historial de chat de un viaje
app.get("/api/chat/:tripId/history", async (req, res) => {
    const tripId = req.params.tripId;
    
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("tripId", sql.Int, tripId)
            .query(`
                SELECT remitente, mensaje, tipo, fecha_envio 
                FROM HistorialChat 
                WHERE id_viaje = @tripId 
                ORDER BY fecha_envio ASC
            `);
            
        const messages = result.recordset.map(msg => ({
            sender: msg.remitente,
            message: msg.mensaje,
            type: msg.tipo,
            timestamp: msg.fecha_envio,
            displayTime: new Date(msg.fecha_envio).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            })
        }));
        
        res.json(messages);
    } catch (err) {
        // Si hay error, devolver mensajes de memoria
        res.json(globalChatMessages[tripId] || []);
    }
});

// Ruta mejorada para guardar mensajes en base de datos
app.post("/api/chat/:tripId/save", async (req, res) => {
    const tripId = req.params.tripId;
    const { sender, message, type = "user" } = req.body;
    
    try {
        const pool = await poolPromise;
        await pool.request()
            .input("tripId", sql.Int, tripId)
            .input("sender", sql.NVarChar, sender)
            .input("message", sql.NVarChar, message)
            .input("type", sql.NVarChar, type)
            .query(`
                INSERT INTO HistorialChat (id_viaje, remitente, mensaje, tipo) 
                VALUES (@tripId, @sender, @message, @type)
            `);
            
        res.json({ success: true });
    } catch (err) {
        console.log('Error guardando mensaje en BD:', err);
        res.json({ success: false });
    }
});

// =========================================================
// RUTAS DE VIAJES MEJORADAS
// =========================================================

app.get("/api/trips/offers", (req, res) => {
    res.json(globalTripOffers);
});

// Ruta para crear viaje en base de datos
app.post("/api/trips/request", async (req, res) => {
    const { passengerName, origin, destination, paymentMethod, passengerEmail } = req.body;
    
    if (!passengerName || !origin || !destination) {
        return res.status(400).json({ message: "Datos incompletos" });
    }
    
    const newTrip = {
        id: Date.now(),
        passenger: passengerName,
        passengerEmail: passengerEmail,
        origin: origin,
        destination: destination,
        payment: paymentMethod || 'Efectivo',
        timestamp: new Date().toLocaleTimeString(),
        originCoords: `Lat: -1.65, Lon: -78.68`,
        destinationCoords: `Lat: -1.66, Lon: -78.69`,
        status: 'PENDIENTE'
    };
    
    // Guardar en base de datos
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("passengerEmail", sql.NVarChar, passengerEmail)
            .input("origin", sql.NVarChar, origin)
            .input("destination", sql.NVarChar, destination)
            .input("paymentMethod", sql.NVarChar, paymentMethod || 'Efectivo')
            .query(`
                INSERT INTO Viajes (pasajero_email, origen, destino, metodo_pago, estado) 
                OUTPUT INSERTED.id_viaje
                VALUES (@passengerEmail, @origin, @destination, @paymentMethod, 'PENDIENTE')
            `);
            
        newTrip.id = result.recordset[0].id_viaje;
    } catch (dbErr) {
        console.log('Error guardando viaje en BD:', dbErr);
    }
    
    globalTripOffers.push(newTrip);
    globalChatMessages[newTrip.id] = [];
    
    res.json({ 
        message: "Viaje solicitado. Buscando conductor...",
        tripId: newTrip.id
    });
});

// Ruta mejorada para aceptar viaje
app.post("/api/trips/accept", async (req, res) => {
    try {
        const { tripId, driverName, driverEmail } = req.body;
        
        const numericTripId = parseInt(tripId);
        const tripIndex = globalTripOffers.findIndex(trip => trip.id === numericTripId);
        
        if (tripIndex === -1) {
            return res.status(404).json({ message: "Viaje no encontrado" });
        }

        const trip = globalTripOffers.splice(tripIndex, 1)[0];
        
        const fallbackPassengerLocation = parseCoordinateString(trip.originCoords);

        globalActiveTrips[numericTripId] = {
            ...trip,
            driver: driverName,
            driverEmail: driverEmail,
            status: 'ACEPTADO',
            startTime: new Date(),
            driverLocation: { lat: -1.65, lon: -78.68 },
            passengerLocation: fallbackPassengerLocation || null
        };

        // Actualizar en base de datos
        try {
            const pool = await poolPromise;
            await pool.request()
                .input("tripId", sql.Int, numericTripId)
                .input("driverEmail", sql.NVarChar, driverEmail)
                .query(`
                    UPDATE Viajes SET 
                    conductor_email = @driverEmail,
                    estado = 'ACEPTADO',
                    fecha_aceptacion = GETDATE()
                    WHERE id_viaje = @tripId
                `);
        } catch (dbErr) {
            console.log('Error actualizando viaje en BD:', dbErr);
        }

        // Actualizar estadísticas
        appStatistics.activeTrips++;

        if (!globalChatMessages[numericTripId]) {
            globalChatMessages[numericTripId] = [];
        }

        // Mensaje automático al pasajero
        globalChatMessages[numericTripId].push({
            sender: "Sistema UniRiders",
            message: `🚗 ${driverName} ha aceptado tu viaje. Está en camino hacia ti.`,
            timestamp: new Date().toISOString(),
            displayTime: new Date().toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            type: "system"
        });

        res.json({ 
            message: "Viaje aceptado exitosamente",
            trip: globalActiveTrips[numericTripId]
        });

    } catch (error) {
        res.status(500).json({ message: "Error al aceptar viaje" });
    }
});

app.get("/api/trips/:id/status", (req, res) => {
    const tripId = parseInt(req.params.id);
    
    if (globalActiveTrips[tripId]) {
        return res.json({ 
            status: globalActiveTrips[tripId].status,
            driver: globalActiveTrips[tripId].driver
        });
    }
    
    const pendingTrip = globalTripOffers.find(t => t.id === tripId);
    if (pendingTrip) {
        return res.json({ status: 'PENDIENTE', driver: null });
    }
    
    return res.status(404).json({ message: "Viaje no encontrado" });
});

app.get("/api/trips/:id/driverLocation", (req, res) => {
    const tripId = parseInt(req.params.id);
    
    if (globalActiveTrips[tripId] && globalActiveTrips[tripId].driverLocation) {
        return res.json(globalActiveTrips[tripId].driverLocation);
    }
    
    return res.status(404).json({ message: "Ubicación no disponible" });
});

// Ruta para reanudar viaje - NUEVA
app.post("/api/trips/:id/resume", async (req, res) => {
    const tripId = parseInt(req.params.id);
    const userEmail = req.headers['user-email'];
    const userRole = req.headers['user-role'];

    if (!userEmail || !userRole) {
        return res.status(400).json({ message: "Datos de usuario requeridos" });
    }

    try {
        const pool = await poolPromise;
        
        // Verificar que el viaje existe y pertenece al usuario
        let query;
        if (userRole === 'conductor') {
            query = `SELECT id_viaje, estado, conductor_email FROM Viajes WHERE id_viaje = @tripId AND conductor_email = @userEmail`;
        } else {
            query = `SELECT id_viaje, estado, pasajero_email FROM Viajes WHERE id_viaje = @tripId AND pasajero_email = @userEmail`;
        }

        const result = await pool.request()
            .input("tripId", sql.Int, tripId)
            .input("userEmail", sql.NVarChar, userEmail)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Viaje no encontrado o no tienes permisos" });
        }

        const trip = result.recordset[0];
        
        // Solo permitir reanudar viajes ACTIVOS
        if (trip.estado !== 'ACEPTADO') {
            return res.status(400).json({ message: "Solo se pueden reanudar viajes activos" });
        }

        // Reactivar el viaje en memoria si es necesario
        if (!globalActiveTrips[tripId]) {
            // Reconstruir el viaje activo desde la base de datos
            const tripDetails = await pool.request()
                .input("tripId", sql.Int, tripId)
                .query(`
                    SELECT v.*, p.nombre as nombre_pasajero, c.nombre as nombre_conductor
                    FROM Viajes v
                    LEFT JOIN Usuarios p ON p.email = v.pasajero_email
                    LEFT JOIN Usuarios c ON c.email = v.conductor_email
                    WHERE v.id_viaje = @tripId
                `);

            if (tripDetails.recordset.length > 0) {
                const tripData = tripDetails.recordset[0];
                globalActiveTrips[tripId] = {
                    id: tripData.id_viaje,
                    passenger: tripData.nombre_pasajero,
                    passengerEmail: tripData.pasajero_email,
                    driver: tripData.nombre_conductor,
                    driverEmail: tripData.conductor_email,
                    origin: tripData.origen,
                    destination: tripData.destino,
                    payment: tripData.metodo_pago,
                    status: 'ACEPTADO',
                    originCoords: `Lat: -1.65, Lon: -78.68`,
                    destinationCoords: `Lat: -1.66, Lon: -78.69`
                };
            }
        }

        // Asegurarse de que existe el chat para este viaje
        if (!globalChatMessages[tripId]) {
            globalChatMessages[tripId] = [];
            
            // Agregar mensaje de sistema
            globalChatMessages[tripId].push({
                sender: "Sistema UniRiders",
                message: "🔄 Viaje reanudado. Continuando con el servicio...",
                timestamp: new Date().toISOString(),
                displayTime: new Date().toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                type: "system"
            });
        }

        res.json({ 
            success: true, 
            message: "Viaje reanudado exitosamente",
            trip: globalActiveTrips[tripId]
        });

    } catch (error) {
        console.error('Error reanudando viaje:', error);
        res.status(500).json({ message: "Error al reanudar el viaje" });
    }
});

// Ruta mejorada para finalizar viaje
app.post("/api/trips/complete", async (req, res) => {
    try {
        const { tripId, driverEmail } = req.body;
        const numericTripId = parseInt(tripId);
        
        if (!globalActiveTrips[numericTripId]) {
            return res.status(404).json({ message: "Viaje no encontrado" });
        }

        const trip = globalActiveTrips[numericTripId];
        const tripCost = (Math.random() * 5 + 2).toFixed(2);
        
        // Guardar en base de datos
        try {
            const pool = await poolPromise;
            await pool.request()
                .input("tripId", sql.Int, numericTripId)
                .input("driverEmail", sql.NVarChar, driverEmail)
                .input("cost", sql.Decimal(10,2), tripCost)
                .query(`
                    UPDATE Viajes SET 
                    estado = 'COMPLETADO', 
                    fecha_finalizacion = GETDATE(),
                    costo = @cost
                    WHERE id_viaje = @tripId AND conductor_email = @driverEmail
                `);
        } catch (dbErr) {
            console.log('Error guardando viaje en BD:', dbErr);
        }

        // Actualizar estadísticas
        appStatistics.activeTrips--;
        appStatistics.completedTrips++;
        appStatistics.totalEarnings += parseFloat(tripCost);

        // Mensaje final al pasajero
        if (globalChatMessages[numericTripId]) {
            globalChatMessages[numericTripId].push({
                sender: "Sistema UniRiders",
                message: `🏁 Viaje finalizado. Costo: $${tripCost}. ¡Gracias por viajar con UniRiders!`,
                timestamp: new Date().toISOString(),
                displayTime: new Date().toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                type: "system"
            });
            
            // Guardar mensaje del sistema en BD
            try {
                const pool = await poolPromise;
                await pool.request()
                    .input("tripId", sql.Int, numericTripId)
                    .input("sender", sql.NVarChar, "Sistema UniRiders")
                    .input("message", sql.NVarChar, `🏁 Viaje finalizado. Costo: $${tripCost}. ¡Gracias por viajar con UniRiders!`)
                    .input("type", sql.NVarChar, "system")
                    .query(`
                        INSERT INTO HistorialChat (id_viaje, remitente, mensaje, tipo) 
                        VALUES (@tripId, @sender, @message, @type)
                    `);
            } catch (msgErr) {
                console.log('Error guardando mensaje del sistema:', msgErr);
            }
        }

        // Cambiar estado del viaje
        globalActiveTrips[numericTripId].status = 'FINALIZADO';
        globalActiveTrips[numericTripId].endTime = new Date();
        globalActiveTrips[numericTripId].cost = tripCost;

        res.json({ 
            message: "Viaje finalizado exitosamente",
            cost: tripCost
        });

    } catch (error) {
        res.status(500).json({ message: "Error al finalizar viaje" });
    }
});

// Ruta para actualizar ubicación del conductor
app.post("/api/driver/location", (req, res) => {
    const headerEmail = req.headers['user-email'];
    const { email: bodyEmail, lat, lon } = req.body;

    if (lat === undefined || lon === undefined) {
        return res.status(400).json({ message: "Latitud y longitud son requeridas" });
    }

    const normalizedEmail = bodyEmail || headerEmail;
    const numericLat = parseFloat(lat);
    const numericLon = parseFloat(lon);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Email del conductor requerido" });
    }

    const locationPayload = { lat: numericLat, lon: numericLon, timestamp: Date.now() };
    driverLocations.set(normalizedEmail, locationPayload);

    Object.keys(globalActiveTrips).forEach(tripId => {
        const trip = globalActiveTrips[tripId];
        if (trip && (trip.driverEmail === normalizedEmail || trip.driver === normalizedEmail)) {
            trip.driverLocation = { lat: numericLat, lon: numericLon };
        }
    });

    res.json({ success: true });
});

app.post("/api/trips/:id/passengerLocation", (req, res) => {
    const tripId = parseInt(req.params.id);
    const { lat, lon } = req.body;
    const passengerEmail = req.headers['user-email'];

    if (lat === undefined || lon === undefined) {
        return res.status(400).json({ message: "Latitud y longitud son requeridas" });
    }

    const numericLat = parseFloat(lat);
    const numericLon = parseFloat(lon);

    const activeTrip = globalActiveTrips[tripId];
    if (!activeTrip) {
        return res.status(404).json({ message: "Viaje no encontrado o no activo" });
    }

    const locationPayload = {
        lat: numericLat,
        lon: numericLon,
        timestamp: Date.now()
    };

    activeTrip.passengerLocation = { lat: numericLat, lon: numericLon };

    if (passengerEmail) {
        passengerLocations.set(passengerEmail, locationPayload);
    }

    res.json({ success: true });
});

app.get("/api/trips/:id/passengerLocation", (req, res) => {
    const tripId = parseInt(req.params.id);
    const activeTrip = globalActiveTrips[tripId];

    if (activeTrip && activeTrip.passengerLocation) {
        return res.json(activeTrip.passengerLocation);
    }

    return res.status(404).json({ message: "Ubicación no disponible" });
});

// =========================================================
// SISTEMA DE CHAT AVANZADO
// =========================================================

app.use('/api/chat', (req, res, next) => {
    next();
});

app.get("/api/chat/:tripId/messages", (req, res) => {
    const tripId = req.params.tripId;
    
    if (!globalChatMessages[tripId]) {
        globalChatMessages[tripId] = [];
        globalChatMessages[tripId].push({
            sender: "Sistema UniRiders",
            message: "¡Conexión establecida! Pueden comunicarse de forma segura.",
            timestamp: new Date().toISOString(),
            displayTime: new Date().toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            type: "system"
        });
    }
    
    const sortedMessages = globalChatMessages[tripId].sort((a, b) => {
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
    
    res.json(sortedMessages);
});

app.post("/api/chat/:tripId/send", (req, res) => {
    const tripId = req.params.tripId;
    const { sender, message, type = "user" } = req.body;
    
    if (!sender || !message) {
        return res.status(400).json({ message: "Datos incompletos" });
    }
    
    if (!globalChatMessages[tripId]) {
        globalChatMessages[tripId] = [];
    }
    
    const sanitizedMessage = message.trim().slice(0, 500);
    
    const newMessage = {
        sender: sender,
        message: sanitizedMessage,
        timestamp: new Date().toISOString(),
        displayTime: new Date().toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }),
        type: type,
        messageId: Date.now() + Math.random().toString(36).substr(2, 9)
    };
    
    globalChatMessages[tripId].push(newMessage);
    
    // Guardar en base de datos también
    fetch(`http://localhost:${API_PORT}/api/chat/${tripId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender, message: sanitizedMessage, type })
    }).catch(err => console.log('Error guardando mensaje en BD:', err));
    
    if (globalChatMessages[tripId].length > 100) {
        globalChatMessages[tripId] = globalChatMessages[tripId].slice(-80);
    }
    
    typingUsers.delete(`${tripId}_${sender}`);
    
    res.json({ 
        success: true,
        message: "Mensaje enviado", 
        data: newMessage 
    });
});

app.post("/api/chat/:tripId/typing", (req, res) => {
    const tripId = req.params.tripId;
    const { sender, isTyping } = req.body;
    
    const typingKey = `${tripId}_${sender}`;
    
    if (isTyping) {
        typingUsers.set(typingKey, Date.now());
        
        setTimeout(() => {
            if (typingUsers.get(typingKey) === Date.now() - 3000) {
                typingUsers.delete(typingKey);
            }
        }, 3000);
    } else {
        typingUsers.delete(typingKey);
    }
    
    res.json({ success: true });
});

app.get("/api/chat/:tripId/typing", (req, res) => {
    const tripId = req.params.tripId;
    const currentTyping = [];
    
    typingUsers.forEach((timestamp, key) => {
        if (key.startsWith(tripId + '_') && Date.now() - timestamp < 3000) {
            const user = key.split('_')[1];
            currentTyping.push(user);
        }
    });
    
    res.json({ typing: currentTyping });
});

app.post("/api/chat/:tripId/system", (req, res) => {
    const tripId = req.params.tripId;
    const { message } = req.body;
    
    if (!globalChatMessages[tripId]) {
        globalChatMessages[tripId] = [];
    }
    
    const systemMessage = {
        sender: "Sistema UniRiders",
        message: message,
        timestamp: new Date().toISOString(),
        displayTime: new Date().toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        }),
        type: "system"
    };
    
    globalChatMessages[tripId].push(systemMessage);
    
    res.json({ success: true, message: systemMessage });
});

app.post("/api/chat/:tripId/clear", (req, res) => {
    const tripId = req.params.tripId;
    
    typingUsers.forEach((_, key) => {
        if (key.startsWith(tripId + '_')) {
            typingUsers.delete(key);
        }
    });
    
    delete globalChatMessages[tripId];
    res.json({ success: true, message: "Chat limpiado" });
});

app.get("/api/chat/stats", (req, res) => {
    const stats = {
        totalTripsWithChat: Object.keys(globalChatMessages).length,
        totalMessages: Object.values(globalChatMessages).reduce((acc, msgs) => acc + msgs.length, 0),
        usersTyping: Array.from(typingUsers.keys()),
        activeTrips: Object.keys(globalActiveTrips)
    };
    
    res.json(stats);
});

// =========================================================
// ESTADÍSTICAS ESPECÍFICAS PARA CONDUCTOR
// =========================================================

app.get("/api/stats/driver/:email", async (req, res) => {
    const { email } = req.params;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Correo no válido" });
    }

    try {
        const pool = await poolPromise;

        const activeTrips = Object.values(globalActiveTrips).filter(trip => normalizeEmail(trip.driverEmail) === normalizedEmail).length;

        // completedTrips
        let completedTrips = 0;
        try {
            const tripsResult = await pool.request()
                .input("email", sql.NVarChar, normalizedEmail)
                .query("SELECT COUNT(*) as completedTrips FROM Viajes WHERE LOWER(conductor_email) = @email AND estado = 'COMPLETADO'");
            completedTrips = tripsResult.recordset[0].completedTrips || 0;
        } catch (err) {
            completedTrips = Math.floor(Math.random() * 20) + 10 + activeTrips;
        }

        // totalEarnings
        let totalEarnings = "0.00";
        try {
            const earningsResult = await pool.request()
                .input("email", sql.NVarChar, normalizedEmail)
                .query("SELECT ISNULL(SUM(costo), 0) as totalEarnings FROM Viajes WHERE LOWER(conductor_email) = @email AND estado = 'COMPLETADO'");
            totalEarnings = parseFloat(earningsResult.recordset[0].totalEarnings || 0).toFixed(2);
        } catch (err) {
            totalEarnings = (completedTrips * 3.5).toFixed(2);
        }

        // avgRating calculado desde la BD
        let avgRating = "0.00";
        try {
            const avgRes = await pool.request()
                .input("email", sql.NVarChar, normalizedEmail)
                .query("SELECT AVG(CAST(calificacion_conductor AS FLOAT)) AS avgRating FROM Viajes WHERE LOWER(conductor_email) = @email AND calificacion_conductor IS NOT NULL");
            avgRating = parseFloat(avgRes.recordset[0].avgRating || 0).toFixed(2);
        } catch (err) {
            avgRating = "0.00";
        }

        const stats = {
            completedTrips: completedTrips,
            totalEarnings: totalEarnings,
            avgRating: avgRating,
            activeTrips: activeTrips
        };

        res.json(stats);

    } catch (err) {
        console.error('Error obteniendo estadísticas del conductor:', err);
        const activeTrips = Object.values(globalActiveTrips).filter(trip => trip.driverEmail === email).length;
        const completedTrips = Math.floor(Math.random() * 20) + 10 + activeTrips;
        const totalEarnings = (completedTrips * 3.5).toFixed(2);

        res.json({
            completedTrips: completedTrips,
            totalEarnings: totalEarnings,
            avgRating: "0.00",
            activeTrips: activeTrips
        });
    }
});

// =========================================================
// RUTAS DE PERFIL
// =========================================================

app.get("/api/profile/:email", async (req, res) => {
    const { email } = req.params;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Correo no válido" });
    }

    try {
        const pool = await poolPromise;

        // Obtener datos básicos del usuario
        const userResult = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query(`
                SELECT nombre, email, rol, foto_perfil, mime_type, metodo_pago_pref, telefono_whatsapp
                FROM Usuarios
                WHERE LOWER(email) = @email
            `);
        
        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const userData = userResult.recordset[0];
        
        // Calcular calificación promedio según el rol
        const ratingQuery = userData.rol === 'conductor'
            ? `SELECT AVG(CAST(calificacion_conductor AS FLOAT)) as avgRating
                FROM Viajes
                WHERE LOWER(conductor_email) = @email AND calificacion_conductor IS NOT NULL`
            : `SELECT AVG(CAST(calificacion_pasajero AS FLOAT)) as avgRating
                FROM Viajes
                WHERE LOWER(pasajero_email) = @email AND calificacion_pasajero IS NOT NULL`;

        const ratingResult = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query(ratingQuery);
            
        userData.avgRating = parseFloat(ratingResult.recordset[0]?.avgRating || 0).toFixed(1);
        
        let vehicleData = {};
        if (userData.rol === 'conductor') {
            try {
                const vehicleResult = await pool.request()
                    .input("email", sql.NVarChar, normalizedEmail)
                    .query("SELECT marca, modelo, placa FROM Vehiculos WHERE LOWER(email_conductor) = @email");
                
                if (vehicleResult.recordset.length > 0) {
                    vehicleData = vehicleResult.recordset[0];
                }
            } catch (err) {
                // Si no existe la tabla Vehiculos, no hacer nada
            }
        }
        
        res.json({ user: userData, vehicle: vehicleData });

    } catch (err) {
        res.status(500).json({ message: "Error al obtener perfil" });
    }
});

app.post("/api/profile/update", async (req, res) => {
    const { email, name, password, marca, modelo, placa, roleSwitch, paymentMethod, telefono } = req.body;
    const requesterRole = req.headers['user-role'];
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Correo no válido" });
    }

    let desiredRole = roleSwitch;

    if (desiredRole === 'administrador' && requesterRole !== 'administrador') {
        return res.status(403).json({ message: "No tienes permisos para cambiar a rol administrador" });
    }

    if (desiredRole === 'administrador' && !isGmailEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Los administradores deben utilizar correos Gmail" });
    }

    if (normalizedEmail === DEFAULT_ADMIN_EMAIL_LOWER) {
        desiredRole = 'administrador';
    }

    let transaction;

    try {
        if (roleSwitch === 'administrador' && requesterRole !== 'administrador') {
            return res.status(403).json({ message: "No tienes permisos para cambiar a rol administrador" });
        }

        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        let updateQuery = `UPDATE Usuarios SET nombre = @nombre, rol = @rol, metodo_pago_pref = @paymentMethod`;
        let hashedPassword = null;

        if (password && password.trim() !== '') {
            hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += `, password = @password`;
        }

        if (telefono !== undefined) {
            updateQuery += `, telefono_whatsapp = @telefono`;
        }

        updateQuery += ` WHERE LOWER(email) = @email`;

        const request = transaction.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .input("nombre", sql.NVarChar, name)
            .input("rol", sql.NVarChar, desiredRole)
            .input("paymentMethod", sql.NVarChar, paymentMethod);

        if (telefono !== undefined) {
            request.input("telefono", sql.NVarChar, sanitizePhoneNumber(telefono));
        }

        if (password && password.trim() !== '') {
            request.input("password", sql.NVarChar, hashedPassword);
        }

        await request.query(updateQuery);

        if (desiredRole === 'conductor') {
            try {
                const checkVehicle = await transaction.request()
                    .input("email", sql.NVarChar, normalizedEmail)
                    .query("SELECT * FROM Vehiculos WHERE LOWER(email_conductor) = @email");

                if (checkVehicle.recordset.length > 0) {
                    await transaction.request()
                        .input("marca", sql.NVarChar, marca)
                        .input("modelo", sql.NVarChar, modelo)
                        .input("placa", sql.NVarChar, placa)
                        .input("email", sql.NVarChar, normalizedEmail)
                        .query(`UPDATE Vehiculos SET marca = @marca, modelo = @modelo, placa = @placa WHERE LOWER(email_conductor) = @email`);
                } else {
                    await transaction.request()
                        .input("marca", sql.NVarChar, marca)
                        .input("modelo", sql.NVarChar, modelo)
                        .input("placa", sql.NVarChar, placa)
                        .input("email", sql.NVarChar, normalizedEmail)
                        .query(`INSERT INTO Vehiculos (email_conductor, marca, modelo, placa) VALUES (@email, @marca, @modelo, @placa)`);
                }
            } catch (err) {
                // Si no existe la tabla Vehiculos, no hacer nada
            }
        }

        await transaction.commit();
        res.json({ message: "Perfil actualizado exitosamente" });

    } catch (err) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ message: "Error al actualizar perfil" });
    }
});

app.post("/api/profile/upload-photo", upload.single('profile_photo'), async (req, res) => {
    const email = req.body.email;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Correo no válido" });
    }

    if (!req.file) {
        return res.status(400).json({ message: "No se seleccionó ningún archivo" });
    }

    try {
        const pool = await poolPromise;
        const imageBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;

        await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .input("foto_perfil", sql.VarBinary(sql.MAX), imageBuffer)
            .input("mime_type", sql.NVarChar, mimeType)
            .query("UPDATE Usuarios SET foto_perfil = @foto_perfil, mime_type = @mime_type WHERE LOWER(email) = @email");

        res.json({ message: "Foto de perfil actualizada", success: true });
        
    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

app.get("/api/profile/:email/photo", async (req, res) => {
    const { email } = req.params;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
        return res.status(400).json({ message: "Correo no válido" });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("email", sql.NVarChar, normalizedEmail)
            .query("SELECT foto_perfil, mime_type FROM Usuarios WHERE LOWER(email) = @email");
        
        if (result.recordset.length === 0 || !result.recordset[0].foto_perfil) {
            const defaultImagePath = path.join(__dirname, 'img', 'default_avatar.jpg');
            return fs.existsSync(defaultImagePath) ? res.sendFile(defaultImagePath) : res.status(404).json({ message: "Imagen no encontrada" });
        }
        
        const user = result.recordset[0];
        res.setHeader('Content-Type', user.mime_type || 'image/jpeg');
        res.send(user.foto_perfil);
        
    } catch (err) {
        const defaultImagePath = path.join(__dirname, 'img', 'default_avatar.jpg');
        fs.existsSync(defaultImagePath) ? res.sendFile(defaultImagePath) : res.status(404).json({ message: "Error al cargar imagen" });
    }
});

// Ruta para logout
app.post("/api/logout", (req, res) => {
    const userEmail = req.headers['user-email'];
    if (userEmail) {
        driverLocations.delete(userEmail);
        passengerLocations.delete(userEmail);
        appStatistics.activeUsers = Math.max(0, appStatistics.activeUsers - 1);
    }
    res.json({ success: true, message: "Sesión cerrada" });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "Servidor funcionando" });
});

app.post("/api/trips/:id/rate", async (req, res) => {
    const tripId = parseInt(req.params.id);
    const { rating, comment = null, ratedBy } = req.body; // ratedBy: 'driver' o 'passenger'

    if (!rating || !ratedBy) {
        return res.status(400).json({ message: "rating y ratedBy son obligatorios" });
    }

    try {
        const pool = await poolPromise;

        // Obtener emails del viaje
        const tripRes = await pool.request()
            .input("tripId", sql.Int, tripId)
            .query("SELECT id_viaje, conductor_email, pasajero_email FROM Viajes WHERE id_viaje = @tripId");

        if (!tripRes.recordset.length) {
            return res.status(404).json({ message: "Viaje no encontrado" });
        }

        const trip = tripRes.recordset[0];
        let ratedEmail = null;

        if (ratedBy === 'driver') {
            // Conductor califica pasajero
            ratedEmail = trip.pasajero_email;
            await pool.request()
                .input("tripId", sql.Int, tripId)
                .input("rating", sql.Int, rating)
                .input("comment", sql.NVarChar, comment)
                .query(`
                    UPDATE Viajes SET 
                        calificacion_pasajero = @rating,
                        comentario_conductor = @comment
                    WHERE id_viaje = @tripId
                `);

            // Recalcular promedio del pasajero (si lo usas)
            const avgRes = await pool.request()
                .input("email", sql.NVarChar, ratedEmail)
                .query("SELECT AVG(CAST(calificacion_pasajero AS FLOAT)) AS avgRating FROM Viajes WHERE pasajero_email = @email AND calificacion_pasajero IS NOT NULL");

            const avgRating = parseFloat(avgRes.recordset[0].avgRating || 0).toFixed(2);
            return res.json({ success: true, ratedUser: ratedEmail, avgRating });
        } else {
            // Pasajero califica conductor
            ratedEmail = trip.conductor_email;
            await pool.request()
                .input("tripId", sql.Int, tripId)
                .input("rating", sql.Int, rating)
                .input("comment", sql.NVarChar, comment)
                .query(`
                    UPDATE Viajes SET 
                        calificacion_conductor = @rating,
                        comentario_pasajero = @comment
                    WHERE id_viaje = @tripId
                `);

            // Recalcular promedio del conductor
            const avgRes = await pool.request()
                .input("email", sql.NVarChar, ratedEmail)
                .query("SELECT AVG(CAST(calificacion_conductor AS FLOAT)) AS avgRating FROM Viajes WHERE conductor_email = @email AND calificacion_conductor IS NOT NULL");

            const avgRating = parseFloat(avgRes.recordset[0].avgRating || 0).toFixed(2);
            return res.json({ success: true, ratedUser: ratedEmail, avgRating });
        }

    } catch (err) {
        console.error('Error guardando calificación:', err);
        res.status(500).json({ message: "Error al guardar la calificación" });
    }
});

app.post("/api/emergency/alert", async (req, res) => {
    const { userEmail, location = {}, message, tripId = null } = req.body;

    const lat = location?.lat ?? location?.latitude ?? null;
    const lon = location?.lon ?? location?.lng ?? location?.longitude ?? null;

    try {
        const pool = await poolPromise;

        await pool.request()
            .input("email", sql.NVarChar, userEmail || null)
            .input("mensaje", sql.NVarChar, message || 'Alerta de emergencia desde UniRiders')
            .input("lat", sql.Decimal(10, 6), lat !== null ? parseFloat(lat) : null)
            .input("lon", sql.Decimal(10, 6), lon !== null ? parseFloat(lon) : null)
            .input("tripId", sql.Int, tripId !== null ? parseInt(tripId) : null)
            .query(`
                INSERT INTO AlertasEmergencia (usuario_email, mensaje, ubicacion_lat, ubicacion_lon, trip_id)
                VALUES (@email, @mensaje, @lat, @lon, @tripId)
            `);

        const adminContactsResult = await pool.request()
            .query(`
                SELECT nombre, email, telefono_whatsapp
                FROM Usuarios
                WHERE rol = 'administrador'
            `);

        const contacts = adminContactsResult.recordset.map(contact => {
            const normalizedPhone = sanitizePhoneNumber(contact.telefono_whatsapp);
            const whatsappLink = normalizedPhone ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent('Alerta de emergencia desde UniRiders. Usuario: ' + (userEmail || 'desconocido'))}` : null;

            return {
                name: contact.nombre,
                email: contact.email,
                phone: contact.telefono_whatsapp,
                whatsappLink
            };
        });

        res.json({
            success: true,
            message: "Alerta de emergencia enviada",
            contacts
        });
    } catch (err) {
        res.status(500).json({ message: "No se pudo registrar la emergencia" });
    }
});

// Ruta para obtener detalles completos de un viaje (incluye historial de mensajes)
app.get("/api/trips/:id/details", async (req, res) => {
    const tripId = parseInt(req.params.id);

    try {
        const pool = await poolPromise;

        // Intentar obtener datos del viaje desde la BD (con nombres de usuario)
        const tripResult = await pool.request()
            .input("tripId", sql.Int, tripId)
            .query(`
                SELECT v.id_viaje, v.origen, v.destino, v.estado, v.costo, 
                       v.fecha_solicitud, v.fecha_aceptacion, v.fecha_finalizacion, v.metodo_pago,
                       v.pasajero_email, v.conductor_email,
                       p.nombre AS nombre_pasajero,
                       c.nombre AS nombre_conductor
                FROM Viajes v
                LEFT JOIN Usuarios p ON p.email = v.pasajero_email
                LEFT JOIN Usuarios c ON c.email = v.conductor_email
                WHERE v.id_viaje = @tripId
            `);

        let trip;

        if (tripResult.recordset && tripResult.recordset.length > 0) {
            trip = tripResult.recordset[0];
        } else {
            // Fallback: buscar en memoria (globalActiveTrips / globalTripOffers)
            if (globalActiveTrips[tripId]) {
                trip = { ...globalActiveTrips[tripId], id_viaje: tripId };
            } else {
                const pending = globalTripOffers.find(t => t.id === tripId);
                if (pending) trip = { ...pending, id_viaje: tripId };
            }
        }

        if (!trip) {
            return res.status(404).json({ message: "Viaje no encontrado" });
        }

        // Obtener mensajes del historial en BD; si falla, usar memoria globalChatMessages
        let messages = [];
        try {
            const chatRes = await pool.request()
                .input("tripId", sql.Int, tripId)
                .query(`
                    SELECT remitente AS sender, mensaje AS message, tipo AS type, fecha_envio AS timestamp
                    FROM HistorialChat
                    WHERE id_viaje = @tripId
                    ORDER BY fecha_envio ASC
                `);

            messages = chatRes.recordset.map(m => ({
                sender: m.sender,
                message: m.message,
                type: m.type,
                timestamp: m.timestamp,
                displayTime: new Date(m.timestamp).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }));
        } catch (err) {
            // Fallback a mensajes en memoria
            const memMsgs = globalChatMessages[tripId] || [];
            messages = memMsgs.map(m => ({
                sender: m.sender,
                message: m.message,
                type: m.type,
                timestamp: m.timestamp,
                displayTime: m.displayTime || (new Date(m.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
            }));
        }

        // Estructura de salida coherente con el frontend (trip-history.html)
        const responseTrip = {
            id_viaje: trip.id_viaje || trip.id,
            id: trip.id_viaje || trip.id,
            origen: trip.origen,
            destino: trip.destino,
            estado: trip.estado,
            costo: trip.costo,
            fecha_solicitud: trip.fecha_solicitud,
            fecha_aceptacion: trip.fecha_aceptacion,
            fecha_finalizacion: trip.fecha_finalizacion,
            metodo_pago: trip.metodo_pago,
            pasajero_email: trip.pasajero_email,
            conductor_email: trip.conductor_email,
            nombre_pasajero: trip.nombre_pasajero || trip.passenger || null,
            nombre_conductor: trip.nombre_conductor || trip.driver || null,
            messages: messages
        };

        res.json(responseTrip);
    } catch (err) {
        console.error("Error /api/trips/:id/details:", err);
        res.status(500).json({ message: "Error obteniendo detalles del viaje" });
    }
});

// Preparar tablas y columnas necesarias para administración
ensureAdminInfrastructure();

// Inicializar estadísticas al iniciar el servidor
initializeStatistics();

// Actualizar estadísticas periódicamente
setInterval(updateRealTimeStats, 30 * 1000); // Cada 30 segundos

app.listen(API_PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${API_PORT}`);
});