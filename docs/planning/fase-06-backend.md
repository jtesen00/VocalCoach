# Fase 6 — Backend .NET: cuentas, sincronización e IA por servidor

**Estado:** implementada (en `dev`). Arquitectura en ADR-004 y uso en `api/README.md`.

## Qué incluye
- **API ASP.NET Core .NET 10.** Monolito modular con cuatro módulos:
  - Identity, Practice y Progress, cada uno con su esquema de PostgreSQL;
  - Coach, el intermediario de IA, sin base de datos.
- **Cuentas:**
  - registro y login (PBKDF2);
  - JWT de 1 h;
  - refresh tokens de 30 días guardados como hash, que rotan en cada uso; reutilizar uno viejo cierra todas las sesiones;
  - límite de 10 peticiones por minuto e IP en registro y login.
- **Sincronización de intentos:**
  - lotes de hasta 500, idempotentes por el UUID que genera el cliente;
  - rechazo individual de intentos no válidos;
  - un usuario no puede "apropiarse" del id de otro;
  - lectura paginada por fecha de recepción.
- **Progreso en el servidor:** Practice publica `AttemptRecorded` por la outbox y Progress actualiza la racha, los días practicados y el mejor resultado por ejercicio o frase. Es idempotente aunque la outbox entregue dos veces.
- **Profe con IA por el servidor:**
  - `POST /api/coach/teacher` añade la clave de Groq, que vive en el servidor (user-secrets o variable de entorno);
  - exige sesión, valida los mensajes y limita a 12 por minuto y usuario.
- **Web:**
  - Ajustes → **Tu cuenta (opcional)**: crear cuenta o entrar, estado de sincronización, sincronizar ahora y cerrar sesión.
  - Sincronización automática al abrir la app, unos segundos después de cada intento y al recuperar la conexión. Sube lo pendiente y trae lo hecho en otros dispositivos.
  - Con sesión iniciada, el profe con IA usa el servidor y no hace falta pegar ninguna clave.
- **CI** (`.github/workflows/api.yml`): build y tests con PostgreSQL real (Testcontainers).

## Pruebas
- **42 tests .NET:**
  - 11 unitarios de dominio;
  - 21 de arquitectura, entre ellos uno de control que comprueba que las reglas no pasan en vacío;
  - 10 de integración contra PostgreSQL.
- **E2E web** `account.spec.ts` con la API simulada.
- **Probado a mano de punta a punta** (web + API + PostgreSQL): un intento hecho en un navegador aparece, junto con su día del camino, en otro navegador al entrar con la misma cuenta.

## Pendiente
- Despliegue (contenedor de la API y PostgreSQL gestionado) y su URL en `VITE_API_URL`.
- Recuperar la contraseña (necesita envío de emails) y borrar la cuenta (RGPD).
- Tokens en cookie httpOnly (BFF) si la app se publica en un dominio propio; hoy van en el almacenamiento del navegador.
- Sincronizar también el perfil vocal y el progreso por canción (siguen solo en el dispositivo).
- Módulo Catalog cuando haga falta editar el catálogo sin publicar la app.
