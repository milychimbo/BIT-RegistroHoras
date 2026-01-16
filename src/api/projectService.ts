import { api } from './axiosInstance';
import type { Project } from '../types';

export const getProjects = async (): Promise<Project[]> => {
    const response = await api.get('/api/Proyectos/GetAllProyectos');
    return response.data;
};
