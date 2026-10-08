# Contexto del proyecto

**Vocal Coach:** app para aprender a cantar afinado. Escucha la voz en tiempo real, detecta la nota, la compara con un objetivo y da feedback pedagógico.

## Bucle de valor
El usuario canta → la app entiende el pitch → explica qué pasó → el usuario mejora. Todo lo demás se construye alrededor.

## Principios no negociables
- **Tiempo real y local:** el análisis de audio ocurre en el dispositivo (AudioWorklet). El backend nunca está en el bucle de audio y el audio del micrófono no se sube.
- **Separación motor / scoring:** el motor responde "¿qué pitch produce?"; el scoring, "¿qué tal lo hace?".
- **Lenguaje acústico, no fisiológico:** nunca diagnosticar diafragma, cuerdas vocales ni tensión a partir del audio.
- **Sin depender solo del color:** todo estado lleva texto o icono.
- **Contenido:** solo original, de dominio público o con licencia. Las canciones del usuario se quedan en su dispositivo.
- **Orden de fases:** no se adelantan funcionalidades vistosas (IA, clonación de voz) sobre el núcleo.

## Preferencias del equipo
- Respuestas y documentación **en español**.
- **Frontend sin sobreingeniería:** una sola app, estado con hooks, sin librerías de estado global hasta que hagan falta.
- **Backend bien estructurado** (decisión explícita): monolito modular + Clean Architecture + vertical slices + domain events; EF Core para comandos y Dapper para consultas.

## Stack
- Web: React 19 + Vite 7 + TypeScript 5.9, pnpm, Vitest, Playwright. PWA prevista en la Fase 7.
- Backend (Fase 6): ASP.NET Core .NET 10 + PostgreSQL.
- IA (Fases 8b/9): servicio Python aislado sobre GPU serverless.

## Usuarios
Principiantes primero (afinar, saber si están altos o bajos, hábito diario); después intermedios; profesores en el futuro, fuera del MVP.
