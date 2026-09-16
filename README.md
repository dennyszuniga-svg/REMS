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

Los descriptores faciales y las marcaciones se guardan solamente en el navegador del dispositivo de prueba. No se almacenan fotografías. Antes de producción se reemplazará este almacenamiento por el proyecto Appwrite independiente de REMS, con autenticación, permisos, auditoría y copias de seguridad.
