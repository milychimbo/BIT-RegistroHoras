import React, { useState } from 'react';
import { Button, Input, Card, message, Modal, List } from 'antd';
import { AudioOutlined, SendOutlined } from '@ant-design/icons';
import { sendMessageToAgent } from '../api/aiService';
import { getProjects } from '../api/projectService';
import { createActivity } from '../api/activityService';
import type { Project, ActivityPayload } from '../types';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

const { TextArea } = Input;

// Helper to get Speech Config (Move to a service if complex, but simple enough here)
const getSpeechConfig = () => {
    const key = import.meta.env.VITE_SPEECH_KEY;
    const region = import.meta.env.VITE_SPEECH_REGION;

    if (!key || !region) {
        throw new Error("Speech Key or Region not configured");
    }

    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = "es-ES"; // Default to Spanish
    return speechConfig;
};

import { useMsal } from "@azure/msal-react";
import { sendMessageToAgent } from '../api/aiService';
// ... other imports ...

export const ChatInterface: React.FC = () => {
    const { instance, accounts } = useMsal();
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [projectSelectionVisible, setProjectSelectionVisible] = useState(false);
    const [currentActivity, setCurrentActivity] = useState<ActivityPayload | null>(null);
    const [matchingProjects, setMatchingProjects] = useState<Project[]>([]);
    const [isListening, setIsListening] = useState(false);
    // State for Speech Recognizer instance to manage start/stop
    const [recognizerInstance, setRecognizerInstance] = useState<SpeechSDK.SpeechRecognizer | null>(null);

    const handleSend = async () => {
        if (!inputText.trim()) return;
        setLoading(true);
        try {
            // Get User Token for AI
            const tokenResponse = await instance.acquireTokenSilent({
                scopes: ["https://cognitiveservices.azure.com/.default"], // Correct scope for Azure AI Services
                account: accounts[0]
            });

            const responseText = await sendMessageToAgent(tokenResponse.accessToken, inputText);
            if (responseText) {
                // ... rest of code
                let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const aiData = JSON.parse(cleanJson);
                processAiResponse(aiData);
            } else {
                message.error("No response from AI");
            }
        } catch (error) {
            console.error(error);
            message.error("Error processing request");
        } finally {
            setLoading(false);
        }
    };

    const processAiResponse = async (aiData: any) => {
        let allProjects: Project[] = [];
        try {
            allProjects = await getProjects();
        } catch (e) {
            message.error("Failed to load projects");
            return;
        }

        let selectedProjectName = aiData.titulo;

        const matched = allProjects.filter(p =>
            p.nombre.toLowerCase().includes(selectedProjectName?.toLowerCase() || "")
        );

        const selectedProject = matched.find(p => p.nombre.toLowerCase() === selectedProjectName?.toLowerCase()) || matched[0];

        // Use proyectoGuid per user requirement
        const projectId = selectedProject ? selectedProject.proyectoGuid : "";

        const newActivity: ActivityPayload = {
            titulo: selectedProjectName || "",
            horas: aiData.horas || 0,
            observacion: aiData.observacion || "",
            fecharegistro: aiData.fecharegistro || dayjs().format('YYYY-MM-DD'),

            // Backend required fields
            GuidProyect: projectId,
            guid: uuidv4(),
            cliente: "",
            comercial: "",
            areaInterna: "",
            estado: "Pendiente",
            otro: "",
            subAreas: "",
            areaSolicitante: "",
            numeroTicket: "",
            descripcionRequerimiento: "",
            tipoActividad: "",
            rutaSoportes: "",
            tipoHora: "",
            equipos: ""
        };

        setCurrentActivity(newActivity);

        if (matched.length === 1) {
            newActivity.titulo = matched[0].nombre;
            newActivity.GuidProyect = matched[0].proyectoGuid;
            setCurrentActivity(newActivity); // Update with matched details
            setConfirmModalVisible(true);
        } else if (matched.length > 1) {
            setMatchingProjects(matched);
            setProjectSelectionVisible(true);
        } else {
            setMatchingProjects(allProjects);
            setProjectSelectionVisible(true);
        }
    };

    const handleProjectSelect = (project: Project) => {
        if (currentActivity) {
            setCurrentActivity({
                ...currentActivity,
                titulo: project.nombre,
                GuidProyect: project.proyectoGuid
            });
            setProjectSelectionVisible(false);
            setConfirmModalVisible(true);
        }
    };

    const handleConfirmSubmit = async () => {
        if (!currentActivity) return;
        try {
            await createActivity(currentActivity);
            message.success("Actividad registrada exitosamente");
            setConfirmModalVisible(false);
            setInputText("");
            setCurrentActivity(null);
        } catch (e) {
            message.error("Error al registrar actividad");
        }
    };

    const startRecording = async () => {
        try {
            const speechConfig = getSpeechConfig();
            const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
            const newRecognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

            // Set up event handlers for continuous recognition
            newRecognizer.recognizing = (_s, _e) => {
                // Optional: Update UI with partial results if needed, e.g., "Hearing..."
                // setInputText(prev => prev + e.result.text); 
            };

            newRecognizer.recognized = (_s, e) => {
                if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                    setInputText(prev => (prev ? prev + " " + e.result.text : e.result.text));
                }
            };

            newRecognizer.canceled = (_s, e) => {
                console.error(`Canceled: ${e.reason}`);
                if (e.reason === SpeechSDK.CancellationReason.Error) {
                    console.error(`"Error details: ${e.errorDetails}`);
                    message.error("Error de conexión de voz");
                }
                stopRecording(newRecognizer);
            };

            newRecognizer.sessionStopped = () => {
                stopRecording(newRecognizer);
            };

            // Start continuous recognition
            await newRecognizer.startContinuousRecognitionAsync();

            setRecognizerInstance(newRecognizer);
            setIsListening(true);
            setInputText(""); // Clear on new session start
            message.open({
                type: 'loading',
                content: 'Escuchando... (Suelte para terminar)',
                duration: 0,
                key: 'listening_msg'
            });

        } catch (e) {
            console.error(e);
            message.error("Error al acceder al micrófono");
        }
    };

    const stopRecording = (recognizerToStop: SpeechSDK.SpeechRecognizer | null = null) => {
        const targetRecognizer = recognizerToStop || recognizerInstance;
        if (targetRecognizer) {
            targetRecognizer.stopContinuousRecognitionAsync(() => {
                targetRecognizer.close();
                setIsListening(false);
                setRecognizerInstance(null);
                message.destroy('listening_msg');
                message.success('Audio capturado');
            });
        }
    };

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 10px', height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* Chat Area - Sleeker Look */}
            <Card
                className="glass-panel"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)' }}
                bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}
            >
                <div style={{ flex: 1, marginBottom: 20 }}>
                    <h3 className="gradient-text" style={{ textAlign: 'center', marginBottom: 20, fontSize: '1.5rem' }}>
                        Asistente de Registro
                    </h3>
                    <TextArea
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        placeholder="Mantén presionado el micrófono para hablar..."
                        style={{
                            fontSize: '1.2em',
                            borderRadius: 16,
                            border: 'none',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            height: '100%',
                            resize: 'none',
                            padding: 20
                        }}
                    />
                </div>

                {/* Controls Area */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

                    {/* Big Mic Button with Pulse Effect */}
                    <div
                        onPointerDown={startRecording}
                        onPointerUp={() => stopRecording()}
                        onPointerLeave={() => isListening && stopRecording()}
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: isListening ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: isListening ? '0 0 30px rgba(239, 68, 68, 0.6)' : '0 4px 15px rgba(59, 130, 246, 0.4)',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            transform: isListening ? 'scale(1.1)' : 'scale(1)',
                            userSelect: 'none',
                            touchAction: 'none' // Important for mobile long-press
                        }}
                    >
                        <AudioOutlined style={{ fontSize: 32, color: 'white' }} />
                    </div>
                    <p style={{ opacity: 0.6, fontSize: '0.9em' }}>
                        {isListening ? "Soltar para enviar" : "Manten presionado para hablar"}
                    </p>

                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        size="large"
                        onClick={handleSend}
                        loading={loading}
                        block
                        style={{ height: 50, borderRadius: 12, fontSize: '1.1em', fontWeight: 600 }}
                    >
                        Procesar Instrucción
                    </Button>
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, opacity: 0.3, fontSize: '0.7em' }}>
                    v1.0.3
                </div>
            </Card>

            {/* Modals remain the same ... */}
            <Modal
                title="Selecciona el Proyecto"
                open={projectSelectionVisible}
                onCancel={() => setProjectSelectionVisible(false)}
                footer={null}
                centered
            >
                {/* ... same list content ... */}
                <List
                    dataSource={matchingProjects}
                    renderItem={item => (
                        <List.Item onClick={() => handleProjectSelect(item)} style={{ cursor: 'pointer', padding: 15, borderRadius: 8, marginBottom: 5, background: 'rgba(255,255,255,0.05)' }}>
                            <div style={{ fontWeight: 600 }}>{item.nombre}</div>
                        </List.Item>
                    )}
                />
            </Modal>

            <Modal
                title="Confirmar Registro"
                open={confirmModalVisible}
                onOk={handleConfirmSubmit}
                onCancel={() => setConfirmModalVisible(false)}
                okText="Registrar"
                cancelText="Cancelar"
                centered
            >
                {/* ... same confirmation content with updated styles if needed ... */}
                {currentActivity && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        <div>
                            <label style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 5, display: 'block' }}>Proyecto</label>
                            <Input
                                value={currentActivity.titulo}
                                disabled
                                style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', border: 'none' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 15 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 5, display: 'block' }}>Horas</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={currentActivity.horas}
                                    onChange={(e) => setCurrentActivity({ ...currentActivity, horas: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 5, display: 'block' }}>Fecha</label>
                                <Input
                                    type="date"
                                    value={currentActivity.fecharegistro}
                                    onChange={(e) => setCurrentActivity({ ...currentActivity, fecharegistro: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 5, display: 'block' }}>Observación</label>
                            <TextArea
                                rows={3}
                                value={currentActivity.observacion}
                                onChange={(e) => setCurrentActivity({ ...currentActivity, observacion: e.target.value })}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
