# Registro de Asistencia REMS

Prototipo inicial de marcación facial para un celular fijo en **SEDE 1 REMS**.

## Configuración inicial

- Nombre: Registro de Asistencia REMS
- Sede: SEDE 1 REMS
- Radio previsto: 100 m
- Ubicación: pendiente
- Horario: 08:00 a 15:45
- Personal inicial: Giancarlo Bertarelli, Claudia Mongrut, Ricardo Montalvo y Samir Ruiz
- DNI inicial: por definir
- Cuentas previstas: administrador y marcador

## Probar localmente

La cámara necesita HTTPS o `localhost`. Desde la carpeta del repositorio:

```bash
npx serve .
```

Luego abre `/rems-marcacion/` desde el enlace local mostrado.

## Alcance del prototipo

El personal se carga desde el proyecto Appwrite independiente de REMS. Si la conexión no está disponible, la aplicación conserva una lista local de respaldo con las cuatro personas iniciales.

Los descriptores faciales y las marcaciones todavía se guardan solamente en el navegador del dispositivo de prueba. No se almacenan fotografías. Antes de producción se habilitarán autenticación, permisos por cuenta, auditoría y copias de seguridad.

## Appwrite

- Proyecto: `6aab14d50033fc31bd8c`
- Base de datos: `rems-asistencia-db`
- Tabla Personal: `6aab1a950009349c3284`
- Configuración web: `appwrite-config.js`
