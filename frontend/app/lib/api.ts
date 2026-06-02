import axios from 'axios';
import { getSession } from './auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BACKEND_URL,
});

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  const session = await getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Patients API
export const patientsAPI = {
  // Stage 1: Receptionist
  create: (data: any) => api.post('/patients/', data),
  update: (patientId: string, data: any) => api.put(`/patients/${patientId}`, data),
  list: (skip = 0, limit = 10, search = '') =>
    api.get('/patients/', { params: { skip, limit, search } }),
  get: (patientId: string) => api.get(`/patients/${patientId}`),

  // Stage 2: Nurse
  addFamilyHistory: (patientId: string, data: any) =>
    api.post(`/patients/${patientId}/family-history`, data),
  addMedicalHistory: (patientId: string, data: any) =>
    api.post(`/patients/${patientId}/medical-history`, data),
  addMedication: (patientId: string, data: any) =>
    api.post(`/patients/${patientId}/medications`, data),

  // Stage 3: Doctor
  addPrivateInfo: (patientId: string, data: any) =>
    api.post(`/patients/${patientId}/private-info`, data),
};

export default api;
