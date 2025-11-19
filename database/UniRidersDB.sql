/* =========================================================
   0. CREAR BASE DE DATOS Y USARLA
   ========================================================= */
CREATE DATABASE UniRidersDB;
GO

USE UniRidersDB;
GO

/* =========================================================
   1. TABLAS
   ========================================================= */

-- 1.1 Usuarios
CREATE TABLE Usuarios (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    nombre            NVARCHAR(150) NOT NULL,
    email             NVARCHAR(150) NOT NULL UNIQUE,
    password          NVARCHAR(200) NOT NULL,
    rol               NVARCHAR(50)  NOT NULL,
    creado_en         DATETIME      NOT NULL DEFAULT GETDATE(),
    metodo_pago_pref  NVARCHAR(50)  NULL,
    foto_perfil       VARBINARY(MAX) NULL,
    mime_type         NVARCHAR(100) NULL,
    email_verified    BIT           NOT NULL DEFAULT 0,
    telefono_whatsapp NVARCHAR(20)  NULL
);
GO

-- 1.2 EmailVerifications
CREATE TABLE EmailVerifications (
    id       INT IDENTITY(1,1) PRIMARY KEY,
    email    NVARCHAR(150) NOT NULL,
    code     NVARCHAR(10)  NOT NULL,
    purpose  NVARCHAR(50)  NOT NULL,
    expires  DATETIME      NOT NULL,
    used     BIT           NOT NULL DEFAULT 0,
    CONSTRAINT FK_EmailVerifications_Usuarios
        FOREIGN KEY (email) REFERENCES Usuarios(email)
);
GO

-- 1.3 Tarifas
CREATE TABLE Tarifas (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    nombre         NVARCHAR(100) NOT NULL,
    descripcion    NVARCHAR(255) NULL,
    precio         DECIMAL(10,2) NOT NULL,
    activo         BIT           NOT NULL DEFAULT 1,
    fecha_creacion DATETIME      NOT NULL DEFAULT GETDATE()
);
GO

-- 1.4 Viajes
CREATE TABLE Viajes (
    id_viaje               INT IDENTITY(1,1) PRIMARY KEY,
    pasajero_email         NVARCHAR(150) NOT NULL,
    conductor_email        NVARCHAR(150) NULL,
    id_tarifa              INT           NOT NULL,
    origen                 NVARCHAR(255) NOT NULL,
    destino                NVARCHAR(255) NOT NULL,
    estado                 NVARCHAR(50)  NOT NULL,
    costo                  DECIMAL(10,2) NULL,
    metodo_pago            NVARCHAR(50)  NULL,
    fecha_solicitud        DATETIME      NOT NULL DEFAULT GETDATE(),
    fecha_aceptacion       DATETIME      NULL,
    fecha_finalizacion     DATETIME      NULL,
    calificacion_pasajero  DECIMAL(5,2)  NULL,
    calificacion_conductor DECIMAL(5,2)  NULL,
    comentario_pasajero    NVARCHAR(500) NULL,
    comentario_conductor   NVARCHAR(500) NULL,
    CONSTRAINT FK_Viajes_Pasajero
        FOREIGN KEY (pasajero_email)  REFERENCES Usuarios(email),
    CONSTRAINT FK_Viajes_Conductor
        FOREIGN KEY (conductor_email) REFERENCES Usuarios(email),
    CONSTRAINT FK_Viajes_Tarifas
        FOREIGN KEY (id_tarifa)       REFERENCES Tarifas(id)
);
GO

-- 1.5 Vehiculos
CREATE TABLE Vehiculos (
    id_vehiculo     INT IDENTITY(1,1) PRIMARY KEY,
    email_conductor NVARCHAR(150) NOT NULL,
    marca           NVARCHAR(100) NOT NULL,
    modelo          NVARCHAR(100) NOT NULL,
    CONSTRAINT FK_Vehiculos_Usuarios
        FOREIGN KEY (email_conductor) REFERENCES Usuarios(email)
);
GO

-- 1.6 EstadisticasApp
CREATE TABLE EstadisticasApp (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    total_usuarios     INT           NOT NULL DEFAULT 0,
    viajes_activos     INT           NOT NULL DEFAULT 0,
    viajes_completados INT           NOT NULL DEFAULT 0,
    usuarios_activos   INT           NOT NULL DEFAULT 0,
    ingresos_totales   DECIMAL(10,2) NOT NULL DEFAULT 0,
    generado_por       INT           NULL,
    fecha_reporte      DATE          NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    CONSTRAINT FK_Estadisticas_Usuarios
        FOREIGN KEY (generado_por) REFERENCES Usuarios(id)
);
GO

-- 1.7 HistorialChat
CREATE TABLE HistorialChat (
    id_mensaje  INT IDENTITY(1,1) PRIMARY KEY,
    id_viaje    INT           NOT NULL,
    remitente   NVARCHAR(150) NOT NULL,
    mensaje     NVARCHAR(1000) NOT NULL,
    tipo        NVARCHAR(50)  NOT NULL,
    fecha_envio DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Historial_Viajes
        FOREIGN KEY (id_viaje) REFERENCES Viajes(id_viaje)
);
GO

/* =========================================================
   2. ÍNDICES (para rendimiento)
   ========================================================= */

CREATE INDEX idx_Usuarios_email ON Usuarios(email);
CREATE INDEX idx_Viajes_pasajero ON Viajes(pasajero_email);
CREATE INDEX idx_Viajes_conductor ON Viajes(conductor_email);
CREATE INDEX idx_Viajes_estado ON Viajes(estado);
CREATE INDEX idx_Vehiculos_email ON Vehiculos(email_conductor);
GO

/* =========================================================
   3. VISTAS
   ========================================================= */

-- 3.1 Vista detalle de viajes
CREATE VIEW vw_Viajes_Detalle AS
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
JOIN Tarifas  t ON v.id_tarifa = t.id;
GO

-- 3.2 Vista de vehículos con datos de conductor
CREATE VIEW vw_Vehiculos_Conductores AS
SELECT 
    v.id_vehiculo,
    v.marca,
    v.modelo,
    u.nombre AS conductor,
    u.email
FROM Vehiculos v
JOIN Usuarios u ON v.email_conductor = u.email;
GO

/* =========================================================
   4. FUNCIONES
   ========================================================= */

-- 4.1 Total de ingresos del sistema (viajes finalizados)
CREATE FUNCTION fn_TotalIngresos()
RETURNS DECIMAL(10,2)
AS
BEGIN
    DECLARE @total DECIMAL(10,2);
    SELECT @total = ISNULL(SUM(costo),0)
    FROM Viajes
    WHERE estado = 'finalizado';

    RETURN @total;
END;
GO

-- 4.2 Promedio de calificación de un conductor
CREATE FUNCTION fn_PromedioConductor(
    @email NVARCHAR(150)
)
RETURNS DECIMAL(5,2)
AS
BEGIN
    DECLARE @prom DECIMAL(5,2);
    SELECT @prom = AVG(calificacion_conductor)
    FROM Viajes
    WHERE conductor_email = @email
      AND calificacion_conductor IS NOT NULL;

    RETURN @prom;
END;
GO

/* =========================================================
   5. PROCEDIMIENTOS ALMACENADOS
   ========================================================= */

-- 5.1 Registrar usuario con manejo de errores
CREATE PROCEDURE sp_Seguro_RegistrarUsuario
    @nombre   NVARCHAR(150),
    @email    NVARCHAR(150),
    @password NVARCHAR(200),
    @rol      NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO Usuarios (nombre, email, password, rol, creado_en)
        VALUES (@nombre, @email, @password, @rol, GETDATE());
    END TRY
    BEGIN CATCH
        DECLARE @error NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR('Error al registrar usuario: %s', 16, 1, @error);
    END CATCH
END;
GO

-- 5.2 Registrar un nuevo viaje
CREATE PROCEDURE sp_RegistrarViaje
    @pasajero_email  NVARCHAR(150),
    @conductor_email NVARCHAR(150) = NULL,
    @id_tarifa       INT,
    @origen          NVARCHAR(255),
    @destino         NVARCHAR(255),
    @metodo_pago     NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Viajes(
        pasajero_email,
        conductor_email,
        id_tarifa,
        origen,
        destino,
        estado,
        metodo_pago,
        fecha_solicitud
    )
    OUTPUT INSERTED.id_viaje AS id_viaje
    VALUES (
        @pasajero_email,
        @conductor_email,
        @id_tarifa,
        @origen,
        @destino,
        'pendiente',
        @metodo_pago,
        GETDATE()
    );
END;
GO

-- 5.3 Aceptar un viaje
CREATE PROCEDURE sp_AceptarViaje
    @id_viaje INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Viajes
    SET estado = 'aceptado',
        fecha_aceptacion = GETDATE()
    WHERE id_viaje = @id_viaje;
END;
GO

-- 5.4 Finalizar viaje con costo y calificaciones
CREATE PROCEDURE sp_FinalizarViaje
    @id_viaje        INT,
    @costo           DECIMAL(10,2),
    @calif_pasajero  DECIMAL(5,2),
    @calif_conductor DECIMAL(5,2),
    @coment_p        NVARCHAR(500),
    @coment_c        NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Viajes
    SET 
        estado                 = 'finalizado',
        costo                  = @costo,
        fecha_finalizacion     = GETDATE(),
        calificacion_pasajero  = @calif_pasajero,
        calificacion_conductor = @calif_conductor,
        comentario_pasajero    = @coment_p,
        comentario_conductor   = @coment_c
    WHERE id_viaje = @id_viaje;
END;
GO

/* =========================================================
   6. TRIGGER (ACTUALIZAR ESTADÍSTICAS)
   ========================================================= */

-- Asumimos que habrá un registro principal en EstadisticasApp con id = 1
INSERT INTO EstadisticasApp (total_usuarios, viajes_activos, viajes_completados,
                             usuarios_activos, ingresos_totales, generado_por)
VALUES (0,0,0,0,0,NULL);
GO

CREATE TRIGGER trg_ActualizarEstadisticas
ON Viajes
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    /* Solo considerar filas que hayan pasado a estado 'finalizado' */
    ;WITH Cambios AS (
        SELECT i.id_viaje, i.costo, i.estado AS estado_nuevo, d.estado AS estado_anterior
        FROM inserted i
        LEFT JOIN deleted d ON i.id_viaje = d.id_viaje
        WHERE i.estado = 'finalizado'
          AND (d.estado IS NULL OR d.estado <> 'finalizado')
    )
    UPDATE ea
    SET 
        viajes_completados = ea.viajes_completados + (SELECT COUNT(*) FROM Cambios),
        ingresos_totales   = ea.ingresos_totales   + ISNULL((SELECT SUM(costo) FROM Cambios),0)
    FROM EstadisticasApp ea
    WHERE ea.id = 1;
END;
GO

/* =========================================================
   7. EJEMPLOS PARA EJECUTAR CADA COSA
   ========================================================= */

-- 7.1 Insertar usuarios de prueba
EXEC sp_Seguro_RegistrarUsuario
    @nombre   = 'Pasajero Uno',
    @email    = 'pasajero1@uniriders.com',
    @password = 'pass123',
    @rol      = 'pasajero';

EXEC sp_Seguro_RegistrarUsuario
    @nombre   = 'Conductor Uno',
    @email    = 'conductor1@uniriders.com',
    @password = 'pass456',
    @rol      = 'conductor';
GO

-- 7.2 Insertar una tarifa de prueba
INSERT INTO Tarifas (nombre, descripcion, precio)
VALUES ('Tarifa base', 'Tarifa estándar ciudad', 1.50);
GO

-- 7.3 Registrar un viaje
EXEC sp_RegistrarViaje
    @pasajero_email  = 'pasajero1@uniriders.com',
    @conductor_email = 'conductor1@uniriders.com',
    @id_tarifa       = 1,
    @origen          = 'Parque Central',
    @destino         = 'Campus ESPOCH',
    @metodo_pago     = 'Efectivo';
GO

-- 7.4 Aceptar el viaje (id_viaje = 1)
EXEC sp_AceptarViaje
    @id_viaje = 1;
GO

-- 7.5 Finalizar el viaje y activar el trigger de estadísticas
EXEC sp_FinalizarViaje
    @id_viaje        = 1,
    @costo           = 2.00,
    @calif_pasajero  = 5.0,
    @calif_conductor = 4.5,
    @coment_p        = N'Buen servicio',
    @coment_c        = N'Pasajero puntual';
GO

-- 7.6 Consultar vistas
SELECT * FROM vw_Viajes_Detalle;
SELECT * FROM vw_Vehiculos_Conductores;

-- 7.7 Usar funciones
SELECT dbo.fn_TotalIngresos()                    AS Total_Ingresos_Sistema;
SELECT dbo.fn_PromedioConductor('conductor1@uniriders.com') AS Promedio_Conductor;

-- 7.8 Ver estadísticas
SELECT * FROM EstadisticasApp;

-- 7.9 Ver historial de estructura
SELECT * FROM Usuarios;
SELECT * FROM Viajes;
GO
