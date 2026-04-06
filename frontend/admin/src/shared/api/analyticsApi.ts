import { apiClient } from './client';
import type { AnalyticsDashboard, CustomerSegmentsResponse, RealtimeAnalytics } from '../types';

export const analyticsApi = {
  getDashboard: async (): Promise<AnalyticsDashboard> => {
    const response = await apiClient.get<AnalyticsDashboard>('/api/admin/analytics');
    return response.data;
  },

  getRealtime: async (): Promise<RealtimeAnalytics> => {
    const response = await apiClient.get<RealtimeAnalytics>('/api/admin/analytics/realtime');
    return response.data;
  },

  getSegments: async (): Promise<CustomerSegmentsResponse> => {
    const response = await apiClient.get<CustomerSegmentsResponse>('/api/admin/analytics/segments');
    return response.data;
  },
};
