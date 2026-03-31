import { apiClient } from './client';
import type { AnalyticsDashboard, RealtimeAnalytics } from '../types';

export const analyticsApi = {
  getDashboard: async (): Promise<AnalyticsDashboard> => {
    const response = await apiClient.get<AnalyticsDashboard>('/api/admin/analytics');
    return response.data;
  },

  getRealtime: async (): Promise<RealtimeAnalytics> => {
    const response = await apiClient.get<RealtimeAnalytics>('/api/admin/analytics/realtime');
    return response.data;
  },

  getSegments: async (): Promise<any> => {
    const response = await apiClient.get<any>('/api/v1/analytics/segments?tenantId=550e8400-e29b-41d4-a716-446655440000');
    return response.data;
  },
};
