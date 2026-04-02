import { api } from './axiosInstance';
import type { ActivityPayload, Activity } from '../types';

export const createActivity = async (activity: ActivityPayload): Promise<void> => {
    await api.post('/api/Actividad/createActivity', activity);
};

export const getActivitiesByUser = async (email: string): Promise<Activity[]> => {
    const response = await api.get(`/api/Actividad/getactivitybyuser/${email}`);
    return response.data;
};
