# UniRiders

## Base de datos UniRidersDB

En la carpeta `database/` se incluye el script `UniRidersDB.sql` con toda la definición de la nueva base de datos **UniRidersDB**. El script crea las tablas `Usuarios`, `Tarifas`, `Viajes`, `Vehiculos`, `EstadisticasApp`, `HistorialChat` y `EmailVerifications`, junto con índices para los campos consultados con más frecuencia.

El archivo también define vistas (`vw_Viajes_Detalle`, `vw_Vehiculos_Conductores`), funciones (`fn_TotalIngresos`, `fn_PromedioConductor`), procedimientos almacenados (`sp_Seguro_RegistrarUsuario`, `sp_RegistrarViaje`, `sp_AceptarViaje`, `sp_FinalizarViaje`) y el disparador `trg_ActualizarEstadisticas` que mantiene los totales de la aplicación cada vez que un viaje cambia a estado `finalizado`.

Ejecuta el script completo antes de iniciar el servidor Node para contar con toda la automatización (manejo de excepciones, índices y objetos reutilizables) que usa el backend.

---

## Configuración con variables de entorno (requerido)

1. Crea un archivo `.env` dentro de `backend/` tomando como base `backend/.env.example`.
2. Completa las variables de base de datos (`DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME`) y, si deseas, las de correo SMTP.
3. Inicia el backend desde la raíz del repositorio:
   ```bash
   node server.js
   ```

---

## Despliegue gratuito (Frontend + Backend + Base de datos)

Esta guía mantiene sincronizados los datos usando el backend como único punto de acceso a la base de datos.

### 1) Base de datos (SQL Server gratuito)
1. Si tienes un proveedor gratuito de SQL Server con acceso público, créalo y continúa (ej.: Somee u otro hosting que permita conexiones externas).
2. Si no tienes proveedor público gratis (o está cerrado), usa un VPS gratuito con **Oracle Cloud Free Tier** y levanta SQL Server Express con Docker:
   - Crea una VM Always Free (Ubuntu).
   - Instala Docker.
   - Ejecuta SQL Server Express:
     ```bash
     docker run -e 'ACCEPT_EULA=Y' -e 'SA_PASSWORD=TuPasswordSegura123' \
       -p 1433:1433 --name uniriders-sqlserver -d mcr.microsoft.com/mssql/server:2019-latest
     ```
   - Abre el puerto 1433 en el firewall de la VM.
3. Ejecuta `database/UniRidersDB.sql` en tu servidor para crear tablas, vistas, procedimientos y triggers.
4. Anota los datos de conexión (usuario, contraseña, servidor y nombre de base).

### 2) Backend gratuito en Render
1. Crea una cuenta en Render y selecciona **New Web Service**.
2. Conecta tu repositorio de Git y elige la carpeta raíz del proyecto.
3. Configura los siguientes valores:
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `node server.js`
4. Agrega variables de entorno desde `backend/.env.example`:
   - `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME`
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
1. Subir tu SQL Server gratis y ejecutar `database/UniRidersDB.sql`.
2. Configurar y desplegar el backend en Render con las variables de entorno.
3. Configurar `frontend/config.js` con la URL del backend y desplegar el frontend.
4. Probar registro/login para confirmar la sincronización de datos.
