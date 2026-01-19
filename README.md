# UniRiders

## Base de datos UniRidersDB (PostgreSQL)

En la carpeta `database/` se incluye el script `UniRidersDB.postgres.sql` con toda la definición de la base de datos **UniRidersDB**. El script crea las tablas `Usuarios`, `Tarifas`, `Viajes`, `Vehiculos`, `EstadisticasApp`, `HistorialChat`, `EmailVerifications` y `AlertasEmergencia`, junto con índices y vistas para los campos consultados con más frecuencia. Si necesitas el esquema original en SQL Server, permanece disponible en `database/UniRidersDB.sql`.

Ejecuta el script completo antes de iniciar el servidor Node para contar con toda la estructura requerida por el backend.

---

## Configuración con variables de entorno (requerido)

1. Crea un archivo `.env` dentro de `backend/` tomando como base `backend/.env.example`.
2. Completa las variables de base de datos PostgreSQL (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` o `DATABASE_URL`) y, si deseas, las de correo SMTP.
3. Inicia el backend desde la raíz del repositorio:
   ```bash
   npm start
   ```
   Para reinicio automático en desarrollo:
   ```bash
   npm run dev
   ```

---

## Despliegue gratuito (Frontend + Backend + Base de datos)

Esta guía mantiene sincronizados los datos usando el backend como único punto de acceso a la base de datos.

### 1) Base de datos (PostgreSQL gratuito)
1. Crea una base de datos PostgreSQL gratuita (por ejemplo, en Supabase, Neon, Railway, Render o un VPS propio).
2. Ejecuta `database/UniRidersDB.postgres.sql` en tu servidor para crear tablas, vistas e índices.
3. Anota los datos de conexión (host, puerto, usuario, contraseña y nombre de base).

### 2) Backend gratuito en Render
1. Crea una cuenta en Render y selecciona **New Web Service**.
2. Conecta tu repositorio de Git y elige la carpeta raíz del proyecto.
3. Configura los siguientes valores:
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `node backend/server.js`
4. Agrega variables de entorno desde `backend/.env.example`:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` (o `DATABASE_URL`)
   - `MAIL_HOST`, `MAIL_USER`, etc. (opcional)
   - `PUBLIC_BASE_URL` con la URL de Render (ej.: `https://tu-app.onrender.com`)
5. Despliega y copia la URL pública del backend.

### 3) Frontend gratuito en Vercel o Netlify
1. Importa el repositorio en Vercel/Netlify.
2. Configura la carpeta de salida como `frontend/`.
3. Antes de desplegar, abre `frontend/config.js` y fija la URL del backend:
   ```js
   window.UNIRIDERS_API_BASE = "https://tu-backend.onrender.com/api";
   ```
4. Publica el sitio. El frontend usará esa URL para sincronizar datos en tiempo real.

### 4) Verificación de sincronización
1. Abre la web desplegada.
2. Registra un usuario y verifica que el backend cree el usuario en la base de datos.
3. Revisa desde el panel de administrador que los datos estén presentes.

---

## Paso a paso resumido
1. Subir tu PostgreSQL gratis y ejecutar `database/UniRidersDB.postgres.sql`.
2. Configurar y desplegar el backend en Render con las variables de entorno.
3. Configurar `frontend/config.js` con la URL del backend y desplegar el frontend.
4. Probar registro/login para confirmar la sincronización de datos.
