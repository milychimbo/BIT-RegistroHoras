import React, { useState } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { ConfigProvider, theme, App as AntApp, Button } from 'antd';
import { Login } from './pages/Login';
import { ChatInterface } from './components/ChatInterface';

const MainContent: React.FC<{ isGuest?: boolean; exitGuest?: () => void }> = ({ isGuest, exitGuest }) => {
  const { instance, accounts } = useMsal();

  const handleLogout = () => {
    if (isGuest && exitGuest) {
      exitGuest();
    } else {
      instance.logoutPopup().catch(e => {
        console.error(e);
      });
    }
  };

  const userName = isGuest ? "Invitado" : accounts[0]?.name?.split(' ')[0];

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="gradient-text" style={{ margin: 0 }}>Hola, {userName}</h2>
          <p style={{ margin: 0, opacity: 0.7 }}>¿Qué hiciste hoy?</p>
          {isGuest && <small style={{ color: 'orange' }}>Modo Prueba de Voz (Sin guardar)</small>}
        </div>
        <Button onClick={handleLogout} danger ghost>Salir</Button>
      </div>

      <ChatInterface />
    </div>
  );
}

const App: React.FC = () => {
  const [isGuest, setIsGuest] = useState(false);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82f6',
          fontFamily: 'Inter, sans-serif',
          borderRadius: 12,
          colorBgContainer: '#1e293b',
        },
      }}
    >
      <AntApp>
        {isGuest ? (
          <MainContent isGuest={true} exitGuest={() => setIsGuest(false)} />
        ) : (
          <>
            <UnauthenticatedTemplate>
              <div style={{ position: 'relative' }}>
                <Login />
                <div style={{ position: 'absolute', bottom: 20, width: '100%', textAlign: 'center' }}>
                  <Button type="link" onClick={() => setIsGuest(true)}>
                    🎤 Probar Micrófono (Modo Invitado)
                  </Button>
                </div>
              </div>
            </UnauthenticatedTemplate>

            <AuthenticatedTemplate>
              <MainContent />
            </AuthenticatedTemplate>
          </>
        )}
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
