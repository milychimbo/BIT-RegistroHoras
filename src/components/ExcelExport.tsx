import React, { useState } from 'react';
import {
    Modal, Button, DatePicker, Checkbox, Divider, message, Typography, Space, Tag
} from 'antd';
import {
    DownloadOutlined, FileExcelOutlined, TableOutlined, CalendarOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import dayjs, { Dayjs } from 'dayjs';
import type { Activity } from '../types';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ---------------------------------------------------------------
// Definición de todas las columnas exportables
// ---------------------------------------------------------------
interface ColDef {
    key: keyof Activity;
    label: string;
    defaultOn: boolean;
    format?: (val: any) => any;
}

const ALL_COLUMNS: ColDef[] = [
    { key: 'fecharegistro', label: 'Fecha', defaultOn: true, format: (v) => dayjs(v).format('DD/MM/YYYY') },
    { key: 'titulo', label: 'Proyecto', defaultOn: true },
    { key: 'horas', label: 'Horas', defaultOn: true },
    { key: 'observacion', label: 'Observación', defaultOn: true },
    { key: 'cliente', label: 'Cliente', defaultOn: false },
    { key: 'comercial', label: 'Comercial', defaultOn: false },
    { key: 'areaInterna', label: 'Área Interna', defaultOn: false },
    { key: 'subAreas', label: 'Sub-Áreas', defaultOn: false },
    { key: 'areaSolicitante', label: 'Área Solicitante', defaultOn: false },
    { key: 'tipoActividad', label: 'Tipo de Actividad', defaultOn: false },
    { key: 'tipoHora', label: 'Tipo de Hora', defaultOn: false },
    { key: 'equipos', label: 'Equipos', defaultOn: false },
    { key: 'numeroTicket', label: 'N° Ticket', defaultOn: false },
    { key: 'descripcionRequerimiento', label: 'Descripción Requerimiento', defaultOn: false },
    { key: 'proyectoCliente', label: 'Proyecto Cliente', defaultOn: false },
    { key: 'faseDesarrollo', label: 'Fase Desarrollo', defaultOn: false },
    { key: 'estado', label: 'Estado', defaultOn: false },
    { key: 'rutaSoportes', label: 'Ruta Soportes', defaultOn: false },
    { key: 'creadopor', label: 'Creado Por', defaultOn: false },
];

interface Props {
    visible: boolean;
    onClose: () => void;
    activities: Activity[];
}

export const ExcelExport: React.FC<Props> = ({ visible, onClose, activities }) => {
    // Fechas por defecto: inicio del mes actual hasta hoy
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
        dayjs().startOf('month'),
        dayjs()
    ]);
    const [selectedCols, setSelectedCols] = useState<string[]>(
        ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key)
    );

    const handleToggleCol = (key: string) => {
        setSelectedCols(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const handleSelectAll = () => setSelectedCols(ALL_COLUMNS.map(c => c.key));
    const handleSelectNone = () => setSelectedCols([]);
    const handleReset = () => setSelectedCols(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key));

    const filteredActivities = activities.filter(act => {
        const d = dayjs(act.fecharegistro);
        return (
            d.isAfter(dateRange[0].subtract(1, 'day')) &&
            d.isBefore(dateRange[1].add(1, 'day'))
        );
    });

    const colDefs = ALL_COLUMNS.filter(c => selectedCols.includes(c.key));

    const handleExport = () => {
        if (colDefs.length === 0) {
            message.warning('Selecciona al menos una columna para exportar.');
            return;
        }
        if (filteredActivities.length === 0) {
            message.warning('No hay actividades en el rango de fechas seleccionado.');
            return;
        }

        // Construir filas del Excel
        const rows = filteredActivities.map(act => {
            const row: Record<string, any> = {};
            colDefs.forEach(col => {
                const raw = act[col.key];
                row[col.label] = col.format ? col.format(raw) : (raw ?? '');
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(rows);

        // Ajustar ancho de columnas automáticamente
        const colWidths = colDefs.map(col => {
            const maxLen = Math.max(
                col.label.length,
                ...rows.map(r => String(r[col.label] ?? '').length)
            );
            return { wch: Math.min(maxLen + 4, 60) };
        });
        ws['!cols'] = colWidths;

        // Crear libro y descargar
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Horas');

        const fileName = `Horas_${dateRange[0].format('DDMMYYYY')}_${dateRange[1].format('DDMMYYYY')}.xlsx`;
        XLSX.writeFile(wb, fileName);

        message.success(`Exportado: ${filteredActivities.length} registros en "${fileName}"`);
        onClose();
    };

    const totalHours = filteredActivities.reduce((acc, a) => acc + a.horas, 0);

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileExcelOutlined style={{ color: '#34d399', fontSize: 20 }} />
                    <span style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem' }}>
                        Exportar a Excel
                    </span>
                </div>
            }
            open={visible}
            onCancel={onClose}
            centered
            width={580}
            footer={[
                <Button
                    key="cancel"
                    onClick={onClose}
                    style={{ color: 'white', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10 }}
                >
                    Cancelar
                </Button>,
                <Button
                    key="export"
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={handleExport}
                    disabled={selectedCols.length === 0}
                    style={{
                        borderRadius: 10,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                        border: 'none'
                    }}
                >
                    Exportar {filteredActivities.length > 0 ? `(${filteredActivities.length} registros)` : ''}
                </Button>
            ]}
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
                },
                footer: {
                    background: 'rgba(15,15,30,0.98)',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '0 0 16px 16px',
                    padding: '14px 24px'
                },
                content: {
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.7)'
                }
            }}
        >
            {/* ---- RANGO DE FECHAS ---- */}
            <div style={{ marginBottom: 20 }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.78rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em'
                }}>
                    <CalendarOutlined />
                    Rango de Fechas
                </div>
                <RangePicker
                    value={dateRange}
                    onChange={(dates) => {
                        if (dates && dates[0] && dates[1]) {
                            setDateRange([dates[0], dates[1]]);
                        }
                    }}
                    format="DD/MM/YYYY"
                    style={{
                        width: '100%',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'white',
                        height: 42
                    }}
                    allowClear={false}
                />
                {/* Preview badge */}
                {filteredActivities.length > 0 ? (
                    <div style={{
                        marginTop: 10,
                        padding: '8px 14px',
                        background: 'rgba(52,211,153,0.08)',
                        border: '1px solid rgba(52,211,153,0.2)',
                        borderRadius: 10,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem' }}>
                            {filteredActivities.length} registro(s) encontrado(s)
                        </Text>
                        <Tag style={{
                            background: 'rgba(52,211,153,0.15)',
                            color: '#34d399',
                            border: 'none',
                            borderRadius: 6,
                            fontWeight: 700
                        }}>
                            {totalHours.toFixed(2)} h total
                        </Tag>
                    </div>
                ) : (
                    <div style={{
                        marginTop: 10,
                        padding: '8px 14px',
                        background: 'rgba(239,68,68,0.07)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 10
                    }}>
                        <Text style={{ color: 'rgba(248,113,113,0.8)', fontSize: '0.82rem' }}>
                            Sin registros en este rango de fechas
                        </Text>
                    </div>
                )}
            </div>

            <Divider style={{ borderColor: 'rgba(255,255,255,0.07)', margin: '4px 0 16px 0' }} />

            {/* ---- SELECCIÓN DE COLUMNAS ---- */}
            <div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em'
                    }}>
                        <TableOutlined />
                        Columnas a incluir
                    </div>
                    <Space size={6}>
                        <Button
                            size="small"
                            type="text"
                            onClick={handleSelectAll}
                            style={{ color: '#60a5fa', fontSize: '0.75rem', padding: '0 6px' }}
                        >
                            Todas
                        </Button>
                        <Button
                            size="small"
                            type="text"
                            onClick={handleReset}
                            style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', padding: '0 6px' }}
                        >
                            Defecto
                        </Button>
                        <Button
                            size="small"
                            type="text"
                            onClick={handleSelectNone}
                            style={{ color: '#f87171', fontSize: '0.75rem', padding: '0 6px' }}
                        >
                            Ninguna
                        </Button>
                    </Space>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '6px 16px',
                    maxHeight: 260,
                    overflowY: 'auto',
                    paddingRight: 4,
                }}>
                    {ALL_COLUMNS.map(col => {
                        const checked = selectedCols.includes(col.key);
                        return (
                            <div
                                key={col.key}
                                onClick={() => handleToggleCol(col.key)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '7px 10px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    background: checked
                                        ? 'rgba(59,130,246,0.12)'
                                        : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${checked ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                    transition: 'all 0.2s',
                                    userSelect: 'none'
                                }}
                            >
                                <Checkbox
                                    checked={checked}
                                    onChange={() => handleToggleCol(col.key)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ pointerEvents: 'none' }}
                                />
                                <Text style={{
                                    color: checked ? '#93c5fd' : 'rgba(255,255,255,0.55)',
                                    fontSize: '0.82rem',
                                    fontWeight: checked ? 600 : 400
                                }}>
                                    {col.label}
                                </Text>
                            </div>
                        );
                    })}
                </div>

                <div style={{
                    marginTop: 10,
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.3)',
                    textAlign: 'right'
                }}>
                    {selectedCols.length} de {ALL_COLUMNS.length} columnas seleccionadas
                </div>
            </div>
        </Modal>
    );
};
