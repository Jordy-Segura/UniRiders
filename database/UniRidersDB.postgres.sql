-- UniRiders PostgreSQL schema

CREATE TABLE IF NOT EXISTS Usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL,
    rol VARCHAR(50) NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    metodo_pago_pref VARCHAR(50),
    foto_perfil BYTEA,
    mime_type VARCHAR(100),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    telefono_whatsapp VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS EmailVerifications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    code VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Tarifas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    precio NUMERIC(10,2) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS Viajes (
    id_viaje SERIAL PRIMARY KEY,
    pasajero_email VARCHAR(150) NOT NULL REFERENCES Usuarios(email),
    conductor_email VARCHAR(150) REFERENCES Usuarios(email),
    id_tarifa INT NOT NULL REFERENCES Tarifas(id),
    origen VARCHAR(255) NOT NULL,
    destino VARCHAR(255) NOT NULL,
    estado VARCHAR(50) NOT NULL,
    costo NUMERIC(10,2),
    metodo_pago VARCHAR(50),
    fecha_solicitud TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_aceptacion TIMESTAMP,
    fecha_finalizacion TIMESTAMP,
    calificacion_pasajero NUMERIC(5,2),
    calificacion_conductor NUMERIC(5,2),
    comentario_pasajero VARCHAR(500),
    comentario_conductor VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS Vehiculos (
    id_vehiculo SERIAL PRIMARY KEY,
    email_conductor VARCHAR(150) NOT NULL REFERENCES Usuarios(email),
    marca VARCHAR(100) NOT NULL,
    modelo VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS EstadisticasApp (
    id SERIAL PRIMARY KEY,
    total_usuarios INT NOT NULL DEFAULT 0,
    viajes_activos INT NOT NULL DEFAULT 0,
    viajes_completados INT NOT NULL DEFAULT 0,
    usuarios_activos INT NOT NULL DEFAULT 0,
    ingresos_totales NUMERIC(10,2) NOT NULL DEFAULT 0,
    fecha_reporte DATE NOT NULL DEFAULT CURRENT_DATE,
    generado_por VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS HistorialChat (
    id_mensaje SERIAL PRIMARY KEY,
    id_viaje INT NOT NULL REFERENCES Viajes(id_viaje),
    remitente VARCHAR(150) NOT NULL,
    mensaje VARCHAR(1000) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    fecha_envio TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS AlertasEmergencia (
    id SERIAL PRIMARY KEY,
    usuario_email VARCHAR(150) NOT NULL,
    mensaje VARCHAR(500),
    ubicacion_lat NUMERIC(10,6),
    ubicacion_lon NUMERIC(10,6),
    trip_id INT,
    atendido BOOLEAN NOT NULL DEFAULT FALSE,
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    atendido_por VARCHAR(150)
);

CREATE INDEX IF NOT EXISTS idx_Usuarios_email ON Usuarios(email);
CREATE INDEX IF NOT EXISTS idx_Viajes_pasajero ON Viajes(pasajero_email);
CREATE INDEX IF NOT EXISTS idx_Viajes_conductor ON Viajes(conductor_email);
CREATE INDEX IF NOT EXISTS idx_Viajes_estado ON Viajes(estado);
CREATE INDEX IF NOT EXISTS idx_Vehiculos_email ON Vehiculos(email_conductor);

CREATE OR REPLACE VIEW vw_Viajes_Detalle AS
SELECT
    v.id_viaje,
    v.pasajero_email,
    v.conductor_email,
    v.origen,
    v.destino,
    v.estado,
    v.costo,
    v.metodo_pago,
    v.fecha_solicitud,
    v.fecha_aceptacion,
    v.fecha_finalizacion,
    p.nombre AS pasajero,
    c.nombre AS conductor,
    t.nombre AS tarifa
FROM Viajes v
JOIN Usuarios p ON v.pasajero_email = p.email
LEFT JOIN Usuarios c ON v.conductor_email = c.email
JOIN Tarifas t ON v.id_tarifa = t.id;

CREATE OR REPLACE VIEW vw_Vehiculos_Conductores AS
SELECT
    v.id_vehiculo,
    v.marca,
    v.modelo,
    u.nombre AS conductor,
    u.email
FROM Vehiculos v
JOIN Usuarios u ON v.email_conductor = u.email;

INSERT INTO EstadisticasApp (total_usuarios, viajes_activos, viajes_completados, usuarios_activos, ingresos_totales, generado_por)
SELECT 0, 0, 0, 0, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM EstadisticasApp);
