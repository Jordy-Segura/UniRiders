# UniRiders

## Base de datos UniRidersDB

En la carpeta `database/` se incluye el script `UniRidersDB.sql` con toda la definición de la nueva base de datos **UniRidersDB**. El script crea las tablas `Usuarios`, `Tarifas`, `Viajes`, `Vehiculos`, `EstadisticasApp`, `HistorialChat` y `EmailVerifications`, junto con índices para los campos consultados con más frecuencia.

El archivo también define vistas (`vw_Viajes_Detalle`, `vw_Vehiculos_Conductores`), funciones (`fn_TotalIngresos`, `fn_PromedioConductor`), procedimientos almacenados (`sp_Seguro_RegistrarUsuario`, `sp_RegistrarViaje`, `sp_AceptarViaje`, `sp_FinalizarViaje`) y el disparador `trg_ActualizarEstadisticas` que mantiene los totales de la aplicación cada vez que un viaje cambia a estado `finalizado`.

Ejecuta el script completo antes de iniciar el servidor Node para contar con toda la automatización (manejo de excepciones, índices y objetos reutilizables) que usa el backend.