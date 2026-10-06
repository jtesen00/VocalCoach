# Fase 5 — Progreso local

**Estado:** implementada (en `dev`).

## Qué incluye
- **Historial de intentos en IndexedDB** (Dexie, base `vocalcoach`, tabla `attempts`).
  - Un registro **inmutable** por intento, con id generado en el cliente (UUID): la futura sincronización con el backend será idempotente (ADR-005).
  - Cada registro guarda el ejercicio o la frase, el día local, la puntuación, la precisión, si se superó, los segundos cantados y, en los ejercicios, la evaluación por nota que usa el profe.
  - Solo agregados: nunca audio ni frames de pitch.
  - Se carga entero en memoria al abrir la app (son datos pequeños) para que la interfaz y el profe lo lean de forma síncrona; cada intento nuevo se escribe en segundo plano.
  - Sin IndexedDB, el progreso dura la sesión.
- **El profe compara con intentos de sesiones anteriores**, no solo de la actual.
- **Camino de aprendizaje** (`core/progress/path.ts`):
  - 10 "días" con un objetivo cada uno, que combinan ejercicios y frases de «Estrellita».
  - Un día se desbloquea al **superar (≥ 80 %) todos los pasos del anterior**; el calendario no influye (PLAN §2).
- **Racha** (`core/progress/progress.ts`):
  - Días seguidos practicando. Si hoy aún no practicaste, sigue viva desde ayer.
  - Se guarda también la mejor racha.
- **Pestaña Progreso:**
  - racha, días del camino, días practicados y minutos cantando;
  - calendario de las últimas 5 semanas;
  - puntuación media por semana (8 semanas);
  - mejor resultado por ejercicio y por frase;
  - botón para borrar el progreso.
  - Con "Mostrar detalles técnicos", también los porcentajes.
- **Practicar:**
  - tarjeta "Tu camino" con el día en curso, sus pasos y la racha;
  - estrellas del mejor resultado en cada ejercicio.

## Decisiones
- **Sin Zustand:** basta un almacén con `useSyncExternalStore`, como el resto de la app.
- **Frases de canción:** cuentan como tiempo cantado siempre, pero solo superan pasos a velocidad normal.
- `navigator.storage.persist()` queda para la Fase 7 (PWA).

## Pendiente
- Validar con usuarios la duración y el contenido de cada día.
- Migrar a IndexedDB el perfil vocal y el progreso de canciones, que siguen en `localStorage`. Son pequeños y funcionan; se hará al sincronizar con el backend.
