import React, { useState, useEffect } from 'react';
import { Button, Input, Card, message, Modal, List, DatePicker, Space, Tag, Typography, Badge, Segmented } from 'antd';
import { AudioOutlined, SendOutlined, HistoryOutlined, CalendarOutlined, PlusOutlined, SearchOutlined, LeftOutlined, RightOutlined, FileExcelOutlined, DownloadOutlined } from '@ant-design/icons';
import { ExcelUpload } from './ExcelUpload';
import { ExcelExport } from './ExcelExport';
import { sendMessageToAgent } from '../api/aiService';
import { getProjects } from '../api/projectService';
import { createActivity, getActivitiesByUser } from '../api/activityService';
import type { Project, ActivityPayload, Activity } from '../types';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { v4 as uuidv4 } from 'uuid';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { useMsal } from '@azure/msal-react';

dayjs.locale('es');

const { TextArea } = Input;
const { Text } = Typography;

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



export const ChatInterface: React.FC = () => {
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [projectSelectionVisible, setProjectSelectionVisible] = useState(false);
    const [currentActivity, setCurrentActivity] = useState<ActivityPayload | null>(null);
    const [matchingProjects, setMatchingProjects] = useState<Project[]>([]);
    const [isListening, setIsListening] = useState(false);
    // State for Speech Recognizer instance to manage start/stop
    const [recognizerInstance, setRecognizerInstance] = useState<SpeechSDK.SpeechRecognizer | null>(null);
    const [activitiesHistory, setActivitiesHistory] = useState<Activity[]>([]);
    const [selectedDates, setSelectedDates] = useState<string[]>([]); // To support multiple dates
    const [projectSearch, setProjectSearch] = useState(''); // Search query for projects
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
    const [viewDate, setViewDate] = useState(dayjs());
    const [selectedSummaryDate, setSelectedSummaryDate] = useState<string | null>(null);
    const [summaryModalVisible, setSummaryModalVisible] = useState(false);
    const [excelUploadVisible, setExcelUploadVisible] = useState(false);
    const [excelExportVisible, setExcelExportVisible] = useState(false);

    const { accounts } = useMsal();
    const userEmail = accounts[0]?.username || "emily.chimbo@grupobusiness.it";

    useEffect(() => {
        loadHistory();
    }, [userEmail]);

    const loadHistory = async () => {
        if (!userEmail) return;
        try {
            const history = await getActivitiesByUser(userEmail);
            setActivitiesHistory(history);
        } catch (e) {
            console.error("Error loading history", e);
        }
    };

    const handleManualEntry = async () => {
        try {
            const allProjects = await getProjects();
            setMatchingProjects(allProjects);

            // Create a blank activity template
            const blankActivity: ActivityPayload = {
                titulo: "",
                horas: 1,
                observacion: "",
                fecharegistro: dayjs().format('YYYY-MM-DD'),
                GuidProyect: "",
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

            setCurrentActivity(blankActivity);
            setSelectedDates([blankActivity.fecharegistro]);
            setProjectSelectionVisible(true);
        } catch (e) {
            message.error("Error al cargar lista de proyectos");
        }
    };

    const handleSend = async () => {
        if (!inputText.trim()) return;
        setLoading(true);
        try {
            // Revertido a Proxy Auth (client_credentials) para evitar error de consentimiento
            const responseText = await sendMessageToAgent(inputText);
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
        setSelectedDates([newActivity.fecharegistro]); // Start with the AI-detected date

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
        setLoading(true);
        try {
            // Register for each selected date
            for (const date of selectedDates) {
                const activityToCreate = {
                    ...currentActivity,
                    fecharegistro: date,
                    guid: uuidv4() // Generate unique GUID for each entry
                };
                await createActivity(activityToCreate);
            }

            message.success(`${selectedDates.length} actividad(es) registrada(s) exitosamente`);
            setConfirmModalVisible(false);
            setInputText("");
            setCurrentActivity(null);
            setSelectedDates([]);
            loadHistory(); // Refresh history
        } catch (e) {
            message.error("Error al registrar actividad");
        } finally {
            setLoading(false);
        }
    };

    const getFilteredSummary = () => {
        const summary: Record<string, number> = {};
        const start = viewDate.startOf(viewMode);
        const end = viewDate.endOf(viewMode);

        activitiesHistory.forEach(act => {
            const actDate = dayjs(act.fecharegistro);
            if (actDate.isAfter(start.subtract(1, 'ms')) && actDate.isBefore(end.add(1, 'ms'))) {
                const key = actDate.format('YYYY-MM-DD');
                summary[key] = (summary[key] || 0) + act.horas;
            }
        });

        if (viewMode === 'day') {
            const dateKey = viewDate.format('YYYY-MM-DD');
            return [[dateKey, summary[dateKey] || 0]];
        }

        return Object.entries(summary).sort((a, b) => dayjs(a[0]).isBefore(dayjs(b[0])) ? -1 : 1);
    };

    const getViewLabel = () => {
        if (viewMode === 'day') return viewDate.format('DD MMM, YYYY');
        if (viewMode === 'week') {
            const start = viewDate.startOf('week').format('DD');
            const end = viewDate.endOf('week').format('DD MMM');
            return `${start} - ${end}`;
        }
        return viewDate.format('MMMM YYYY');
    };

    const navigateView = (direction: 'prev' | 'next') => {
        const amount = direction === 'prev' ? -1 : 1;
        setViewDate(viewDate.add(amount, viewMode as any));
    };

    const handleSummaryClick = (date: string) => {
        setSelectedSummaryDate(date);
        setSummaryModalVisible(true);
    };

    const getActivitiesByDate = (date: string) => {
        return activitiesHistory.filter(act => dayjs(act.fecharegistro).format('YYYY-MM-DD') === date);
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
        <div style={{
            maxWidth: 1200,
            margin: '0 auto',
            height: 'calc(100vh - 180px)',
            display: 'flex',
            gap: 20,
            width: '100%'
        }}>

            {/* Main Chat/Input Column */}
            <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Card
                    className="glass-panel"
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 24,
                        border: '1px solid rgba(255,255,255,0.1)',
                        overflow: 'hidden'
                    }}
                    bodyStyle={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '20px',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <Button
                                    type="text"
                                    icon={<FileExcelOutlined style={{ color: '#34d399', fontSize: 20 }} />}
                                    onClick={() => setExcelUploadVisible(true)}
                                    title="Importar desde Excel"
                                />
                                <Button
                                    type="text"
                                    icon={<DownloadOutlined style={{ color: '#a78bfa', fontSize: 20 }} />}
                                    onClick={() => setExcelExportVisible(true)}
                                    title="Exportar a Excel"
                                />
                            </div>
                            <h3 className="gradient-text" style={{ margin: 0, fontSize: '1.4rem' }}>
                                Asistente de Registro
                            </h3>
                            <Button
                                type="text"
                                icon={<PlusOutlined style={{ color: '#3b82f6', fontSize: 20 }} />}
                                onClick={handleManualEntry}
                                title="Registro Manual"
                            />
                        </div>
                        <TextArea
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            placeholder="Mantén presionado el micrófono o escribe aquí..."
                            style={{
                                fontSize: '1.1em',
                                borderRadius: 16,
                                border: 'none',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: '#fff',
                                flex: 1,
                                resize: 'none',
                                padding: 15
                            }}
                        />
                    </div>

                    {/* Controls Area - More Compact */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginTop: 15 }}>
                        <div
                            onPointerDown={startRecording}
                            onPointerUp={() => stopRecording()}
                            onPointerLeave={() => isListening && stopRecording()}
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: '50%',
                                background: isListening ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: isListening ? '0 0 20px rgba(239, 68, 68, 0.5)' : '0 4px 10px rgba(59, 130, 246, 0.3)',
                                transition: 'all 0.3s ease',
                                transform: isListening ? 'scale(1.05)' : 'scale(1)',
                                userSelect: 'none',
                                touchAction: 'none',
                                flexShrink: 0
                            }}
                        >
                            <AudioOutlined style={{ fontSize: 24, color: 'white' }} />
                        </div>

                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            size="large"
                            onClick={handleSend}
                            loading={loading}
                            style={{ height: 56, borderRadius: 16, fontSize: '1.1em', fontWeight: 600, flex: 1 }}
                        >
                            Procesar
                        </Button>
                    </div>
                </Card>
            </div>

            {/* Summary & History Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 380, height: '100%' }}>
                {/* Summary Card with Navigation */}
                <Card
                    className="glass-panel"
                    title={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '5px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: 'white', fontSize: '0.9rem' }}><CalendarOutlined /> Resumen</div>
                                <Segmented
                                    size="small"
                                    value={viewMode}
                                    onChange={(val) => {
                                        setViewMode(val as any);
                                        setViewDate(dayjs());
                                    }}
                                    options={[
                                        { label: 'D', value: 'day' },
                                        { label: 'S', value: 'week' },
                                        { label: 'M', value: 'month' }
                                    ]}
                                    style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 8 }}>
                                <Button type="text" size="small" icon={<LeftOutlined style={{ fontSize: 12 }} />} onClick={() => navigateView('prev')} style={{ color: 'white' }} />
                                <Text style={{ color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>{getViewLabel()}</Text>
                                <Button type="text" size="small" icon={<RightOutlined style={{ fontSize: 12 }} />} onClick={() => navigateView('next')} style={{ color: 'white' }} />
                            </div>
                        </div>
                    }
                    style={{ borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)', flex: 1.4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, padding: 12, overflowY: 'auto', minHeight: 0 }}
                >
                    <List
                        dataSource={getFilteredSummary()}
                        size="small"
                        footer={
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 8px',
                                borderTop: '1px solid rgba(255,255,255,0.1)',
                                marginTop: 4,
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '0 0 12px 12px'
                            }}>
                                <Text style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>Total Periodo</Text>
                                <Text style={{ color: '#60a5fa', fontWeight: 800, fontSize: '1rem' }}>
                                    {getFilteredSummary().reduce<number>((acc, [, h]) => acc + Number(h), 0).toFixed(2)}h
                                </Text>
                            </div>
                        }
                        renderItem={(item: any) => {
                            const [date, hours] = item;
                            return (
                                <List.Item
                                    onClick={() => handleSummaryClick(date)}
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        padding: '12px 8px',
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        transition: 'background 0.3s'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                        <Text style={{ color: 'white', opacity: 0.8, fontSize: '0.85rem' }}>{dayjs(date).format('DD MMM, YYYY')}</Text>
                                        <Badge
                                            count={`${hours}h`}
                                            style={{
                                                backgroundColor: hours >= 7 ? 'rgba(16, 185, 129, 0.15)' : (hours >= 4 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                                color: hours >= 7 ? '#34d399' : (hours >= 4 ? '#fbbf24' : '#f87171'),
                                                borderColor: hours >= 7 ? 'rgba(16, 185, 129, 0.3)' : (hours >= 4 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                padding: '0 8px',
                                                height: 22,
                                                lineHeight: '20px'
                                            }}
                                        />
                                    </div>
                                </List.Item>
                            );
                        }}
                        locale={{ emptyText: <Text style={{ color: 'white', opacity: 0.3, fontSize: '0.8rem' }}>Sin registros</Text> }}
                    />
                </Card>

                {/* Recent Activities Card */}
                <Card
                    className="glass-panel"
                    title={<div style={{ color: 'white', fontSize: '0.9rem' }}><HistoryOutlined /> Últimos Registros</div>}
                    style={{ borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, padding: 12, overflowY: 'auto', minHeight: 0 }}
                >
                    <List
                        dataSource={activitiesHistory.slice(0, 10)}
                        size="small"
                        renderItem={act => (
                            <List.Item style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'block', padding: '8px 4px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#3b82f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.titulo}</div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.observacion}</div>
                                <div style={{ fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', marginTop: 4, opacity: 0.5 }}>
                                    <span>{dayjs(act.fecharegistro).format('DD/MM/YY')}</span>
                                    <span style={{ fontWeight: 700 }}>{act.horas}h</span>
                                </div>
                            </List.Item>
                        )}
                    />
                </Card>
            </div>

            {/* Modals remain the same ... */}
            <Modal
                title="Selecciona el Proyecto"
                open={projectSelectionVisible}
                onCancel={() => setProjectSelectionVisible(false)}
                footer={null}
                centered
            >
                {/* ... same list content ... */}
                <Input
                    placeholder="Buscar proyecto..."
                    prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    style={{ marginBottom: 15, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white' }}
                />
                <List
                    dataSource={matchingProjects.filter(p =>
                        p.nombre.toLowerCase().includes(projectSearch.toLowerCase())
                    )}
                    renderItem={item => (
                        <List.Item onClick={() => {
                            handleProjectSelect(item);
                            setProjectSearch(''); // Reset search on select
                        }} style={{ cursor: 'pointer', padding: 15, borderRadius: 8, marginBottom: 5, background: 'rgba(255,255,255,0.05)' }}>
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
                                <label style={{ fontSize: '0.9em', opacity: 0.7, marginBottom: 5, display: 'block' }}>Fecha(s)</label>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <DatePicker
                                        multiple
                                        value={selectedDates.map(d => dayjs(d))}
                                        onChange={(dates) => {
                                            if (dates && Array.isArray(dates)) {
                                                setSelectedDates(dates.map(d => d.format('YYYY-MM-DD')));
                                            }
                                        }}
                                        style={{ width: '100%' }}
                                        placeholder="Seleccionar fechas"
                                    />
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {selectedDates.map(date => (
                                            <Tag
                                                key={date}
                                                closable
                                                onClose={() => setSelectedDates(selectedDates.filter(d => d !== date))}
                                                style={{ borderRadius: 8 }}
                                            >
                                                {dayjs(date).format('DD/MM')}
                                            </Tag>
                                        ))}
                                    </div>
                                </Space>
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
            <Modal
                title={null}
                open={summaryModalVisible}
                onCancel={() => setSummaryModalVisible(false)}
                footer={null}
                centered
                width={650}
                styles={{
                    mask: { backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' },
                    body: {
                        background: '#1a1a1a',
                        borderRadius: 24,
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: 0,
                        overflow: 'hidden'
                    }
                }}
            >
                <div style={{ padding: '24px 24px 0 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registro de Actividades</Text>
                            <h2 className="gradient-text" style={{ margin: '4px 0 0 0', fontSize: '1.6rem', fontWeight: 700 }}>
                                {selectedSummaryDate ? dayjs(selectedSummaryDate).format('dddd, D [de] MMMM') : ''}
                            </h2>
                        </div>
                        <Button
                            type="text"
                            icon={<PlusOutlined rotate={45} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18 }} />}
                            onClick={() => setSummaryModalVisible(false)}
                        />
                    </div>
                </div>

                <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
                    <List
                        dataSource={selectedSummaryDate ? getActivitiesByDate(selectedSummaryDate) : []}
                        renderItem={act => (
                            <div key={act.id} style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: 16,
                                padding: 16,
                                marginBottom: 12,
                                border: '1px solid rgba(255,255,255,0.05)',
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 15 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#60a5fa', marginBottom: 6 }}>{act.titulo}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: 10 }}>
                                            {act.observacion || <i style={{ opacity: 0.5 }}>Sin descripción detallada</i>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {act.cliente && (
                                                <Tag style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', border: 'none', borderRadius: 6, fontSize: '0.75rem' }}>
                                                    {act.cliente}
                                                </Tag>
                                            )}
                                            {act.tipoActividad && (
                                                <Tag style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 6, fontSize: '0.75rem' }}>
                                                    {act.tipoActividad}
                                                </Tag>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)',
                                        color: '#60a5fa',
                                        padding: '4px 12px',
                                        borderRadius: 8,
                                        fontWeight: 800,
                                        fontSize: '0.9rem',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {act.horas} h
                                    </div>
                                </div>
                            </div>
                        )}
                        locale={{ emptyText: <Text style={{ color: 'rgba(255,255,255,0.3)', display: 'block', textAlign: 'center', padding: 40 }}>No hay registros para este día.</Text> }}
                    />
                </div>

                <div style={{ padding: '0 24px 24px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        onClick={() => setSummaryModalVisible(false)}
                        style={{
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white',
                            height: 40,
                            padding: '0 25px'
                        }}
                    >
                        Cerrar
                    </Button>
                </div>
            </Modal>

            <ExcelUpload
                visible={excelUploadVisible}
                onClose={() => setExcelUploadVisible(false)}
                onSuccess={() => { loadHistory(); }}
            />
            <ExcelExport
                visible={excelExportVisible}
                onClose={() => setExcelExportVisible(false)}
                activities={activitiesHistory}
            />
        </div>
    );
};
