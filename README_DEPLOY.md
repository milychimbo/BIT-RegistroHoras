# Guía de Despliegue en Vercel

## 1. Configuración del Proyecto
Para desplegar este proyecto en Vercel, sigue estos pasos:

1.  Ve a [Vercel Dashboard](https://vercel.com/dashboard) y haz clic en **"Add New..."** -> **"Project"**.
2.  Importa tu repositorio de GitHub donde subiste este código.
3.  Vercel detectará automáticamente que es un proyecto **Vite**. La configuración de `Build Command` (`npm run build`) y `Output Directory` (`dist`) debería ser correcta por defecto.

## 2. Variables de Entorno (Environment Variables)
Como el archivo `.env` **NO** se ha subido al repositorio por seguridad (contiene claves secretas), debes configurar estas variables manualmente en Vercel.

Ve a la pestaña **Settings** -> **Environment Variables** en tu proyecto de Vercel y agrega las siguientes claves (copia los valores de tu `.env` local):

| Variable | Descripción/Valor Ejemplo |
|----------|---------------------------|
| `VITE_API_BASE_URL` | `https://registrohorasback.azurewebsites.net` |
| `VITE_API_SCOPE` | `api://e489252d-25e0-4a9d-abb8-eeb1edf8b09f/access_as_user` |
| `VITE_AZURE_CLIENT_ID` | `e489252d-25e0-4a9d-abb8-eeb1edf8b09f` |
| `VITE_AZURE_TENANT_ID` | `24884996-6863-4925-a1ba-f1a160b581e2` |
| `VITE_AI_ENDPOINT` | `https://frcorregidorprompts.services.ai.azure.com/` |
| `VITE_AI_PROJECT_ID` | `proj-bitpromptstudio` |
| `VITE_AI_ASSISTANT_ID` | `asst_hQpIJ6xYpOcox1Gc8aTnVjHZ` |
| `VITE_AI_TENANT_ID` | `24884996-6863-4925-a1ba-f1a160b581e2` |
| `VITE_AI_CLIENT_ID` | `c11e9e05-ce41-4653-95e6-99a8c88821b6` |
| `VITE_AI_CLIENT_SECRET` | *TU_SECRETO_AQUI* (Cópialo de tu .env local) |
| `VITE_SPEECH_KEY` | *TU_KEY_DE_VOZ* (Cópialo de tu .env local) |
| `VITE_SPEECH_REGION` | `eastus` |

## 3. Configuración de Proxy (IMPORTANTE)
Este proyecto usa Proxies de Vite (`vite.config.ts`) para evitar problemas de CORS localmente (`/api/auth-proxy`, `/api/ai-proxy`).

**En Producción (Vercel):**
Vite Proxy **NO** funciona en producción. El código de frontend intentará llamar a `/api/...` y Vercel debe saber cómo manejar eso. Para eso hemos creado el archivo `vercel.json` con una configuración básica, **PERO** para que las llamadas a API de Azure funcionen sin backend intermedio en Vercel, necesitarías configurar **Vercel Serverless Functions** como proxies o apuntar directamente a las APIs (lo cual requeriría que esas APIs tengan CORS habilitado para tu dominio de Vercel).

**Solución Recomendada:**
Si el backend (`registrohorasback`) y el servicio de IA no permiten CORS desde tu dominio `vercel.app`, las llamadas fallarán.
1.  **Backend .NET**: Debes ir a Azure Portal -> Tu App Service -> API -> CORS y agregar tu dominio de Vercel (ej: `https://mi-proyecto.vercel.app`).
2.  **Azure AI**: Es más estricto. Si da problemas de CORS, la solución ideal es usar Serverless Functions de Vercel para ocultar las llamadas, similar a lo que hicimos en `vite.config.ts`.

## 4. Git
Si tuviste problemas subiendo cambios:
```bash
git push origin main
# Si te dice "upstream gone", usa:
git push --set-upstream origin main
```
