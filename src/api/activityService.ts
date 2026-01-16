import { api } from './axiosInstance';
import type { ActivityPayload } from '../types';

export const createActivity = async (activity: ActivityPayload): Promise<void> => {
    await api.post('/api/Actividad/createActivity', activity);
};
