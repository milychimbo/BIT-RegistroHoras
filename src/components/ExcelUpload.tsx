import React, { useState, useRef } from 'react';
import { Modal, List, Button, Input, message, Tag, Progress, Typography, Divider } from 'antd';
import { SearchOutlined, FileExcelOutlined, UploadOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { getProjects } from '../api/projectService';
import { createActivity } from '../api/activityService';
import type { Project, ActivityPayload } from '../types';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

const { Text } = Typography;

// Columnas reconocidas del Excel de revisión de horas
// El archivo tiene: Fecha | Actividad | Horas | Observación
interface ExcelRow {
    fecha: string;
    actividad: string;
    horas: number;
    observacion: string;
}

interface ParsedRow extends ExcelRow {
    idx: number;
    status: 'pending' | 'ok' | 'error';
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Intenta mapear columnas de forma flexible (case-insensitive, sin tildes)
function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function findCol(headers: string[], candidates: string[]): number {
    for (const c of candidates) {
        const idx = headers.findIndex(h => normalize(h).includes(normalize(c)));
        if (idx !== -1) return idx;
    }
    return -1;
}

function parseExcelDate(raw: any): string {
    if (!raw) return dayjs().format('YYYY-MM-DD');
    // Si es número de serie de Excel
    if (typeof raw === 'number') {
        const date = XLSX.SSF.parse_date_code(raw);
        if (date) {
            const m = String(date.m).padStart(2, '0');
            const d = String(date.d).padStart(2, '0');
            return `${date.y}-${m}-${d}`;
        }
    }
    // Si es string, intentar parsear
    const parsed = dayjs(raw, ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D/M/YYYY'], true);
    if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
    // Último intento con dayjs sin formato
    const fallback = dayjs(raw);
    return fallback.isValid() ? fallback.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
}

export const ExcelUpload: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
    const [step, setStep] = useState<'upload' | 'selectProject' | 'confirm' | 'uploading'>('upload');
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [projectSearch, setProjectSearch] = useState('');
    const [progress, setProgress] = useState(0);
    const [uploadResults, setUploadResults] = useState<{ ok: number; error: number }>({ ok: 0, error: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleReset = () => {
        setStep('upload');
        setParsedRows([]);
        setSelectedProject(null);
        setProjectSearch('');
        setProgress(0);
        setUploadResults({ ok: 0, error: 0 });
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleFile = async (file: File) => {
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: false });

            // Tomar la primera hoja
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Convertir a array de arrays
            const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (rawData.length < 2) {
                message.error('El archivo no tiene datos suficientes');
                return;
            }

            // Encontrar la fila de encabezados (buscar la primera fila con contenido real)
            let headerRowIdx = 0;
            for (let i = 0; i < Math.min(10, rawData.length); i++) {
                const row = rawData[i];
                const hasContent = row.some((cell: any) => String(cell).trim() !== '');
                if (hasContent) {
                    headerRowIdx = i;
                    break;
                }
            }

            const headers = rawData[headerRowIdx].map((h: any) => String(h));

            const colFecha = findCol(headers, ['fecha', 'date', 'dia', 'día']);
            const colActividad = findCol(headers, ['actividad', 'titulo', 'título', 'tarea', 'task', 'descripcion', 'descripción']);
            const colHoras = findCol(headers, ['horas', 'hours', 'tiempo', 'time', 'hrs', 'h']);
            const colObs = findCol(headers, ['observacion', 'observación', 'obs', 'detalle', 'nota', 'comentario', 'description']);

            if (colHoras === -1) {
                message.error('No se encontró la columna de Horas en el archivo');
                return;
            }

            const rows: ParsedRow[] = [];
            for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                const row = rawData[i];
                const rawHoras = row[colHoras];
                if (rawHoras === '' || rawHoras === null || rawHoras === undefined) continue;
                const horas = parseFloat(String(rawHoras).replace(',', '.'));
                if (isNaN(horas) || horas <= 0) continue;

                rows.push({
                    idx: i,
                    fecha: colFecha !== -1 ? parseExcelDate(row[colFecha]) : dayjs().format('YYYY-MM-DD'),
                    actividad: colActividad !== -1 ? String(row[colActividad] || '').trim() : '',
                    horas,
                    observacion: colObs !== -1 ? String(row[colObs] || '').trim() : '',
                    status: 'pending'
                });
            }

            if (rows.length === 0) {
                message.error('No se encontraron filas con horas válidas');
                return;
            }

            setParsedRows(rows);

            // Cargar proyectos y pasar a selección de proyecto
            const allProjects = await getProjects();
            setProjects(allProjects);
            setStep('selectProject');
        } catch (err) {
            console.error(err);
            message.error('Error al leer el archivo Excel');
        }
    };

    const handleProjectSelect = (project: Project) => {
        setSelectedProject(project);
        setProjectSearch('');
        setStep('confirm');
    };

    const handleSubmit = async () => {
        if (!selectedProject) return;
        setStep('uploading');
        let ok = 0;
        let errCount = 0;

        for (let i = 0; i < parsedRows.length; i++) {
            const row = parsedRows[i];
            const payload: ActivityPayload = {
                guid: uuidv4(),
                titulo: selectedProject.nombre,
                horas: row.horas,
                observacion: row.actividad || row.observacion || '',
                fecharegistro: row.fecha,
                GuidProyect: selectedProject.proyectoGuid,
                cliente: '',
                comercial: '',
                areaInterna: '',
                estado: 'Pendiente',
                otro: '',
                subAreas: '',
                areaSolicitante: '',
                numeroTicket: '',
                descripcionRequerimiento: row.observacion || row.actividad || '',
                tipoActividad: '',
                rutaSoportes: '',
                tipoHora: '',
                equipos: ''
            };

            try {
                await createActivity(payload);
                ok++;
                setParsedRows(prev => prev.map(r => r.idx === row.idx ? { ...r, status: 'ok' } : r));
            } catch {
                errCount++;
                setParsedRows(prev => prev.map(r => r.idx === row.idx ? { ...r, status: 'error' } : r));
            }

            setProgress(Math.round(((i + 1) / parsedRows.length) * 100));
        }

        setUploadResults({ ok, error: errCount });
        if (ok > 0) {
            onSuccess();
        }
    };

    const statusIcon = (s: ParsedRow['status']) => {
        if (s === 'ok') return <CheckCircleOutlined style={{ color: '#34d399' }} />;
        if (s === 'error') return <ExclamationCircleOutlined style={{ color: '#f87171' }} />;
        return null;
    };

    const renderStep = () => {
        // ---- STEP: UPLOAD ----
        if (step === 'upload') {
            return (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <FileExcelOutlined style={{ fontSize: 56, color: '#34d399', marginBottom: 16 }} />
                    <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: '0.95rem' }}>
                        Sube un Excel con columnas de <b>Fecha</b>, <b>Actividad</b>, <b>Horas</b> y <b>Observación</b>.<br />
                        Te preguntaré el proyecto antes de registrar.
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                            e.target.value = '';
                        }}
                    />
                    <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        size="large"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            height: 52,
                            borderRadius: 14,
                            fontWeight: 700,
                            fontSize: '1rem',
                            background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                            border: 'none',
                            paddingLeft: 32,
                            paddingRight: 32
                        }}
                    >
                        Seleccionar archivo Excel
                    </Button>
                </div>
            );
        }

        // ---- STEP: SELECT PROJECT ----
        if (step === 'selectProject') {
            const filtered = projects.filter(p =>
                p.nombre.toLowerCase().includes(projectSearch.toLowerCase())
            );
            return (
                <div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontSize: '0.85rem' }}>
                        Se encontraron <b style={{ color: '#60a5fa' }}>{parsedRows.length} filas</b> con horas en el Excel.
                        <br />¿A qué proyecto deseas asignarlas?
                    </div>
                    <Input
                        prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
                        placeholder="Buscar proyecto..."
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        autoFocus
                        style={{
                            marginTop: 12,
                            marginBottom: 12,
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white'
                        }}
                        allowClear
                    />
                    <List
                        dataSource={filtered}
                        style={{ maxHeight: 300, overflowY: 'auto' }}
                        renderItem={item => (
                            <List.Item
                                onClick={() => handleProjectSelect(item)}
                                style={{
                                    cursor: 'pointer',
                                    padding: '12px 16px',
                                    borderRadius: 10,
                                    marginBottom: 6,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            >
                                <Text style={{ color: 'white', fontWeight: 600 }}>{item.nombre}</Text>
                            </List.Item>
                        )}
                        locale={{ emptyText: <Text style={{ color: 'rgba(255,255,255,0.3)' }}>Sin resultados</Text> }}
                    />
                </div>
            );
        }

        // ---- STEP: CONFIRM ----
        if (step === 'confirm') {
            return (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>PROYECTO SELECCIONADO</Text>
                        <div style={{
                            marginTop: 6,
                            padding: '10px 16px',
                            borderRadius: 10,
                            background: 'rgba(59,130,246,0.12)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            color: '#60a5fa',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            {selectedProject?.nombre}
                            <Button
                                type="text"
                                size="small"
                                style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}
                                onClick={() => setStep('selectProject')}
                            >
                                Cambiar
                            </Button>
                        </div>
                    </div>
                    <Divider style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>FILAS A REGISTRAR ({parsedRows.length})</Text>
                    <List
                        dataSource={parsedRows}
                        style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}
                        renderItem={row => (
                            <List.Item style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 4px' }}>
                                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
                                            {dayjs(row.fecha).format('DD/MM/YYYY')}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {row.actividad || row.observacion || '(sin descripción)'}
                                        </div>
                                    </div>
                                    <Tag style={{
                                        background: 'rgba(59,130,246,0.1)',
                                        color: '#60a5fa',
                                        border: 'none',
                                        borderRadius: 6,
                                        fontWeight: 700,
                                        flexShrink: 0
                                    }}>
                                        {row.horas}h
                                    </Tag>
                                </div>
                            </List.Item>
                        )}
                    />
                    <div style={{
                        marginTop: 12,
                        padding: '10px 16px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                        display: 'flex',
                        justifyContent: 'space-between'
                    }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Total horas</Text>
                        <Text style={{ color: '#34d399', fontWeight: 800, fontSize: '0.95rem' }}>
                            {parsedRows.reduce((acc, r) => acc + r.horas, 0).toFixed(2)} h
                        </Text>
                    </div>
                </div>
            );
        }

        // ---- STEP: UPLOADING ----
        if (step === 'uploading') {
            const done = progress === 100;
            return (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    {!done ? (
                        <>
                            <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                Registrando horas... ({parsedRows.filter(r => r.status !== 'pending').length}/{parsedRows.length})
                            </div>
                            <Progress
                                percent={progress}
                                strokeColor={{ '0%': '#3b82f6', '100%': '#34d399' }}
                                trailColor="rgba(255,255,255,0.1)"
                                style={{ padding: '0 20px' }}
                            />
                        </>
                    ) : (
                        <>
                            <CheckCircleOutlined style={{ fontSize: 52, color: '#34d399', marginBottom: 16 }} />
                            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem', marginBottom: 8 }}>
                                Proceso completado
                            </div>
                            {uploadResults.ok > 0 && (
                                <Tag color="success" style={{ fontSize: '0.9rem', padding: '4px 14px', borderRadius: 8, marginRight: 8 }}>
                                    ✓ {uploadResults.ok} registros exitosos
                                </Tag>
                            )}
                            {uploadResults.error > 0 && (
                                <Tag color="error" style={{ fontSize: '0.9rem', padding: '4px 14px', borderRadius: 8 }}>
                                    ✗ {uploadResults.error} errores
                                </Tag>
                            )}
                        </>
                    )}
                    {done && (
                        <List
                            dataSource={parsedRows}
                            style={{ maxHeight: 200, overflowY: 'auto', marginTop: 20, textAlign: 'left' }}
                            renderItem={row => (
                                <List.Item style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '6px 4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>
                                            {dayjs(row.fecha).format('DD/MM')} — {row.actividad || '(sin desc.)'}
                                        </Text>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <Tag style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'none', borderRadius: 6, fontWeight: 700 }}>{row.horas}h</Tag>
                                            {statusIcon(row.status)}
                                        </div>
                                    </div>
                                </List.Item>
                            )}
                        />
                    )}
                </div>
            );
        }

        return null;
    };

    const renderFooter = () => {
        if (step === 'upload') return [
            <Button key="cancel" onClick={handleClose} style={{ color: 'white', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10 }}>
                Cancelar
            </Button>
        ];
        if (step === 'selectProject') return [
            <Button key="back" onClick={() => setStep('upload')} style={{ color: 'white', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10 }}>
                Volver
            </Button>
        ];
        if (step === 'confirm') return [
            <Button key="back" onClick={() => setStep('selectProject')} style={{ color: 'white', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10 }}>
                Volver
            </Button>,
            <Button
                key="submit"
                type="primary"
                onClick={handleSubmit}
                style={{
                    borderRadius: 10,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none'
                }}
            >
                Registrar {parsedRows.length} actividades
            </Button>
        ];
        if (step === 'uploading' && progress === 100) return [
            <Button
                key="done"
                type="primary"
                onClick={handleClose}
                style={{ borderRadius: 10, fontWeight: 700, background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', border: 'none' }}
            >
                Finalizar
            </Button>
        ];
        return [];
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileExcelOutlined style={{ color: '#34d399', fontSize: 20 }} />
                    <span style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem' }}>
                        {step === 'upload' ? 'Subir Excel de Horas' :
                            step === 'selectProject' ? 'Seleccionar Proyecto' :
                                step === 'confirm' ? 'Confirmar Registros' :
                                    'Subiendo Horas...'}
                    </span>
                </div>
            }
            open={visible}
            onCancel={step === 'uploading' && progress < 100 ? undefined : handleClose}
            footer={renderFooter()}
            centered
            width={560}
            styles={{
                mask: { backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.65)' },
                header: {
                    background: 'rgba(15,15,30,0.98)',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '16px 16px 0 0',
                    padding: '18px 24px'
                },
                body: {
                    background: 'rgba(15,15,30,0.98)',
                    padding: '20px 24px',
                    minHeight: 180
                },
                footer: {
                    background: 'rgba(15,15,30,0.98)',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '0 0 16px 16px',
                    padding: '14px 24px'
                },
                container: {
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.7)'
                }
            }}
        >
            {renderStep()}
        </Modal>
    );
};
