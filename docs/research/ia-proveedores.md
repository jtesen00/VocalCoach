# Investigación: proveedores de IA gratuitos para Vocal Coach

_Revisado: octubre de 2026. Los planes gratuitos cambian a menudo: hay que comprobar los límites en la consola de cada proveedor antes de depender de ellos._

## 1. Para qué usar IA aquí (y para qué no)

La detección de pitch, la evaluación, el profesor, las recomendaciones de tono y la extracción de melodía ya funcionan **en el dispositivo, sin IA y sin conexión**. Eso no se cambia: es rápido, privado y gratis. La IA se añade donde aporta algo que las reglas no pueden dar:

| Caso de uso | Entrada a la IA | Tipo de IA | Valor |
|---|---|---|---|
| **A. Profe conversacional** | Datos agregados del perfil y del intento (diagnóstico, % de acierto, frase débil), **nunca audio** | LLM de texto | Explicaciones y ánimo más naturales y variados, preguntas del alumno ("¿por qué me cuesta el agudo?") y plan semanal personalizado |
| **B. Letra para canciones importadas** | La letra que el usuario pega (texto) + número de notas de cada línea | LLM de texto | Sílabas repartidas sobre las notas: karaoke con letra |
| **C. Transcribir la letra cantada** | Audio de la voz (**sale del dispositivo**) | Voz a texto (Whisper) | Letra automática sin pegarla. Solo con consentimiento explícito |
| **D. Separar la voz** (fase 8c) | Audio de la canción | Demucs / MDX (no es un LLM) | Mejor extracción en mezclas mono o densas. Ningún plan gratuito de LLM lo ofrece: se haría en servidor propio o de pago |
| **E. Demostraciones cantadas** (fase 9) | Melodía + letra | Síntesis de canto | Fuera de alcance por ahora (ADR-008) |

**Regla del proyecto:** el profe determinista sigue siendo la fuente de verdad (qué está mal y qué ejercicio toca). El LLM solo **redacta** y **conversa** a partir de esos datos, con las mismas restricciones: lenguaje acústico, nunca diagnósticos del cuerpo.

## 2. Proveedores con plan gratuito

| Proveedor | Modelos gratis útiles | Límites gratis (aprox.) | Lo mejor | A tener en cuenta |
|---|---|---|---|---|
| **Google Gemini API** (AI Studio) | Gemini Flash y Flash-Lite (los Pro dejaron de ser gratis el 1 de abril de 2026) | ~10–15 peticiones/min, hasta ~1.000/día según el modelo (se ven en AI Studio, por proyecto) | Muy buen español, salida JSON, contexto largo, **multimodal** (texto, audio e imagen) | En el plan gratuito, los datos pueden usarse para mejorar los productos de Google: no enviar datos personales ni audio |
| **Groq** | Modelos abiertos (Llama, Qwen, GPT-OSS…; la lista cambia) y **Whisper** | ~30 peticiones/min; 1.000–14.400/día según el modelo; Whisper ~8 h de audio al día | Rapidísimo; Whisper gratis y generoso | Los modelos gratuitos rotan (alguna fuente indica que Llama salió del plan gratuito): consultar la consola |
| **OpenRouter** | Decenas de modelos `:free` de varios laboratorios | 20 peticiones/min; 50/día (1.000/día tras una recarga única de 10 $) | Una sola clave para muchos modelos; fácil cambiar de modelo | Los modelos gratuitos rotan; algunos proveedores registran los prompts |
| **Cloudflare Workers AI** | Llama, Mistral, Qwen y Whisper | 10.000 *neurons*/día | **Sirve a la vez de proxy seguro** para guardar las claves (Worker gratuito) | Requiere cuenta de Cloudflare y desplegar un Worker |
| **Mistral** (La Plateforme) | Todos sus modelos | Desde el 14/08/2026, 10 $/mes de saldo gratuito compartido | Buen español; europeo (RGPD) | El saldo se agota; después, de pago |
| **Hugging Face** Inference Providers | Muchos modelos, incluidos de audio | 0,10 $/mes de crédito | Catálogo enorme | Crédito gratuito casi simbólico |

## 3. Recomendación

1. **Empezar con Gemini Flash** (Google AI Studio) para los casos A y B: gratis, buen español, JSON estructurado y margen para crecer (audio más adelante).
2. **Groq como segunda opción**, por velocidad y como respaldo si Gemini limita, y **para Whisper** si se aprueba el caso C.
3. Programar contra una **interfaz propia `AiProvider`** con adaptadores (Gemini, Groq, OpenRouter): cambiar de proveedor es configuración, no código.
4. **La IA es opcional**: si no hay clave o se acaba la cuota, la app funciona igual con el profe por reglas.

## 4. Claves (tokens) y seguridad

- **Nunca poner una clave en el código del frontend** ni en variables `VITE_*`: se empaquetan en el JavaScript y cualquiera puede leerlas.
- **Para probar ya (opción rápida):** cada persona pega su propia clave en *Ajustes → IA*. Se guarda solo en su navegador y las llamadas van directas al proveedor. Sirve para pruebas personales, no para publicar la app a otros usuarios.
- **Para producción:** un **proxy** que guarda la clave como secreto y aplica límites por usuario: un Cloudflare Worker gratuito ahora, o el backend .NET de la Fase 6 (ADR-004). El navegador nunca ve la clave.
- **Privacidad:** a la IA solo van texto y datos agregados. El audio sale del dispositivo únicamente con consentimiento explícito (caso C) y nunca en el plan gratuito de un proveedor que use los datos para entrenar.

## 5. Qué se necesita del equipo
- Crear una clave de **Gemini** en Google AI Studio (aistudio.google.com → *Get API key*) y, opcionalmente, una de **Groq** (console.groq.com → *API Keys*).
- Decidir el primer caso de uso (recomendado: **A, profe conversacional**, o **B, letra para canciones importadas**).
- Decidir entre la clave en el navegador (solo pruebas) o un proxy desde el principio (recomendado si otras personas van a probar la app).

## Fuentes
- Gemini: [límites del plan gratuito (memetik)](https://www.memetik.ai/guides/gemini-api-free-tier-limits), [precios 2026 (CloudZero)](https://www.cloudzero.com/blog/gemini-pricing/), [qué es gratis (flo2)](https://flo2.com/blog/gemini-free-tier), [términos y uso de datos (Simon Willison)](https://simonwillison.net/2024/Oct/17/gemini-terms-of-service)
- Groq: [límites del plan gratuito (Grizzly Peak)](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb), [1.000 peticiones al día, Llama fuera (Klymentiev)](https://klymentiev.com/blog/groq-pricing), [precios (CloudZero)](https://www.cloudzero.com/blog/groq-pricing/)
- OpenRouter: [límites del plan gratuito (Klymentiev)](https://klymentiev.com/blog/openrouter-free-tier), [modelos gratuitos (CostGoat)](https://costgoat.com/pricing/openrouter-free-models)
- Mistral: [plan gratuito 2026 (AgentDeals)](https://agentdeals.dev/vendor/mistral-ai)
- Cloudflare: [precios de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- Hugging Face: [crédito gratuito de Inference API (Klymentiev)](https://klymentiev.com/blog/huggingface-inference-api)
