import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Alert, Button, Card, Typography } from 'antd';
import { loginRequest } from '../auth/authConfig';

export function McpConnect() {
  const { instance, accounts } = useMsal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ticket = new URLSearchParams(location.search).get('mcp_connect') || '';
  async function connect() {
    setBusy(true); setError('');
    try {
      let account = accounts[0];
      if (!account) account = (await instance.loginPopup(loginRequest)).account!;
      let token;
      try { token = await instance.acquireTokenSilent({ ...loginRequest, account }); }
      catch { token = await instance.acquireTokenPopup({ ...loginRequest, account }); }
      const response = await fetch('/api/oauth?action=link', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, accessToken: token.accessToken })
      });
      const result = await response.json();
      if (!response.ok || !result.redirect) throw new Error('link_failed');
      location.assign(result.redirect);
    } catch {
      setError('No se pudo conectar. Si el enlace caducó, inicia nuevamente la conexión desde ChatGPT.');
    } finally { setBusy(false); }
  }
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <Card style={{ maxWidth: 540 }}>
      <Typography.Title level={2}>Conectar Registro de Horas</Typography.Title>
      <Typography.Paragraph>Autoriza a ChatGPT a consultar tus actividades y registrar las horas que apruebes. El acceso durará lo que permita tu sesión de Microsoft; después podrás reconectar desde aquí.</Typography.Paragraph>
      {accounts[0] && <Typography.Paragraph>Cuenta: {accounts[0].username}</Typography.Paragraph>}
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" loading={busy} onClick={connect}>Iniciar sesión y conectar</Button>
      <Button style={{ marginLeft: 8 }} onClick={() => location.assign('/')}>Cancelar</Button>
    </Card>
  </div>;
}
