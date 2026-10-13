# MCP en Vercel con la SPA existente

Esta implementación añade `/api/mcp` al mismo proyecto. No necesita el equipo
personal ni tunnel-client. No modifica Entra ID ni usa el Client Secret de Azure.
ChatGPT se autentica contra un servidor OAuth propio; el consentimiento de este
servidor abre la SPA existente en `/`, que usa MSAL y el redirect URI ya registrado.

## Qué ocurre al expirar

El servidor valida la firma Microsoft, tenant, audiencia, scope, usuario y fecha
de expiración del token. Guarda el token cifrado AES-256-GCM en Redis persistente.
El token MCP es opaco, distinto del Microsoft, almacenado solo por su hash y
limitado a la misma expiración. No se guarda ni se exporta el refresh token SPA.
No hay renovación desatendida del token Microsoft: al caducar, el MCP devuelve
401 y el cliente debe reconectar/iniciar sesión. El cliente determina la interfaz
exacta; no se garantiza un popup automático de ChatGPT. Puedes usar Reconectar
manualmente. MSAL intenta obtener acceso silenciosamente en la página de conexión
y pide interacción si es necesario.

## Configurar Vercel

1. Desplegar esta rama inicialmente como Preview para revisar build y UI. Para
   probar el login Microsoft usar el dominio ya registrado, no un Preview nuevo.
2. Añadir una base Redis de Upstash desde Vercel Marketplace o una instancia
   existente. Se requiere soporte GETDEL, SET con TTL y conectividad HTTPS.
3. Mantener las variables VITE existentes. Añadir estas variables **solo de servidor**:

| Variable | Valor |
|---|---|
| MCP_PUBLIC_ORIGIN | `https://bit-registro-horas.vercel.app` sin barra final |
| MCP_ALLOWED_EMAIL | `emily.chimbo@grupobusiness.it` |
| MCP_ENCRYPTION_KEY | 32 bytes aleatorios codificados en base64 |
| UPSTASH_REDIS_REST_URL | URL de la instancia Redis |
| UPSTASH_REDIS_REST_TOKEN | Credencial de Redis |
| MCP_OAUTH_CLIENT_ID | Identificador propio, por ejemplo `chatgpt-bit-horas` |
| MCP_OAUTH_CLIENT_SECRET | Secreto aleatorio propio, diferente del de Azure |
| MCP_OAUTH_REDIRECT_URIS | Callback exacto que muestra ChatGPT, separado por comas si hay varios |
| MCP_ENABLE_WRITES | `false` al probar; `true` para registrar tras validar |

Generar cada secreto localmente con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
No añadirlos con prefijo VITE, no compartirlos por chat ni incluirlos en commits.
Si se cambia la clave de cifrado, los accesos anteriores dejan de funcionar: reconectar.

4. En ChatGPT crear una conexión con URL `https://bit-registro-horas.vercel.app/api/mcp`
   y autenticación OAuth. En configuración avanzada, usar el client ID y secret
   propios de MCP anteriores; no el Client ID/Secret de Entra ID. Copiar el callback
   que muestra ChatGPT y agregarlo a MCP_OAUTH_REDIRECT_URIS. No adivinar la URL.
5. Si solicita URLs manuales:
   - Autorización: `https://bit-registro-horas.vercel.app/api/oauth?action=authorize`
   - Token: `https://bit-registro-horas.vercel.app/api/oauth?action=token`
   - Scope: `activities`
6. Redesplegar tras configurar variables. La metadata OAuth se publica en
   `/.well-known/oauth-authorization-server` y `/.well-known/oauth-protected-resource`.
7. Conectar: iniciar sesión en la página y aprobar con “Iniciar sesión y conectar”.
   Volver a ChatGPT y probar consulta antes de habilitar escritura.

La configuración es para una única cuenta permitida. Sin esa cuenta configurada,
la conexión falla cerrada. Se validan redirect URI exacto, estado, PKCE S256,
cookie HttpOnly ligada al navegador y códigos de un solo uso. Las URLs no incluyen
tokens Microsoft; el navegador los envía por POST HTTPS al servidor.

## Verificación

`npm run build` y `node --test test/*.test.js`.
El MCP usa transporte Streamable HTTP sin estado y respuestas JSON para funciones
Vercel. Las lecturas consultan la API en vivo; no inventan tiempos ni estados.
La creación requiere proyecto real del catálogo y rechaza duplicados exactos,
pero no garantiza idempotencia ante llamadas simultáneas: comprobar listado antes
de reintentar una escritura incierta. No hay edición/borrado.

Pruebas pendientes en entorno real: vinculación OAuth de ChatGPT, MSAL en móvil,
Redis real, expiración/reconexión y contrato de creación contra backend. El código
no modifica registros durante las pruebas locales. La app existente puede tener
otras funciones/costos independientes; esta integración no llama a modelos IA.
