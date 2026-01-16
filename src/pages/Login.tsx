import React from 'react';
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../auth/authConfig";
import { Button, Typography, Layout } from 'antd';
import { LoginOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Content } = Layout;

export const Login: React.FC = () => {
    const { instance } = useMsal();

    const handleLogin = () => {
        instance.loginPopup(loginRequest).catch(e => {
            console.error(e);
        });
    };

    return (
        <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
            <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏱️</div>
                        <Title level={2} style={{ margin: 0, marginBottom: '0.5rem' }}>
                            <span className="gradient-text">Registro de Horas</span>
                        </Title>
                        <Text style={{ color: 'rgba(255,255,255,0.6)' }}>
                            Gestiona tu tiempo con Inteligencia Artificial
                        </Text>
                    </div>

                    <Button
                        type="primary"
                        icon={<LoginOutlined />}
                        size="large"
                        onClick={handleLogin}
                        block
                        shape="round"
                        style={{
                            height: '48px',
                            fontSize: '1.1rem',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                            border: 'none',
                            boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                        }}
                    >
                        Iniciar Sesión
                    </Button>
                </div>
            </Content>
        </Layout>
    );
};
