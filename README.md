# Registro de Asistencia REMS

Prototipo inicial de marcación facial para un celular fijo en **SEDE 1 REMS**.

## Configuración inicial

- Nombre: Registro de Asistencia REMS
- Sede: SEDE 1 REMS
- Radio previsto: 100 m
- Ubicación: pendiente
- Horarios: turnos rotativos por persona y semana, según el archivo `Horario equipo panorama.xlsx`
- Personal inicial: Giancarlo Bertarelli, Claudia Mongrut, Ricardo Montalvo y Samir Ruiz
- DNI inicial: por definir
- Cuentas del sistema: administrador (gestiona personal y registro facial) y marcador (tablet fija de asistencia)

## Probar localmente

La cámara necesita HTTPS o `localhost`. Desde la carpeta del repositorio:

```bash
npx serve .
```

Luego abre `/rems-marcacion/` desde el enlace local mostrado.

## Acceso web

La aplicación está preparada para publicarse como sitio estático mediante GitHub Pages. El acceso está protegido por Appwrite y no permite crear cuentas desde la web.

## Alcance del prototipo

El personal se carga desde el proyecto Appwrite independiente de REMS. Si la conexión no está disponible, la aplicación conserva una lista local de respaldo con las cuatro personas iniciales.

Los descriptores faciales y las marcaciones todavía se guardan solamente en el navegador del dispositivo de prueba. No se almacenan fotografías. Antes de producción se habilitarán autenticación, permisos por cuenta, auditoría y copias de seguridad.

## Appwrite

- Proyecto: `6aab14d50033fc31bd8c`
- Base de datos: `rems-asistencia-db`
- Tabla Personal: `6aab1a950009349c3284`
- Configuración web: `appwrite-config.js`
