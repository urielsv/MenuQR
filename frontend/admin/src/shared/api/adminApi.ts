import { apiClient } from './client';

export interface Table {
  id: string;
  tableNumber: string;
  tableName: string | null;
  capacity: number;
  qrCodeToken: string;
  active: boolean;
  activeSessionCode: string | null;
  hasActiveSession: boolean;
}

export interface Order {
  id: string;
  tableNumber: string;
  orderNumber: number;
  status: string;
  notes: string | null;
  subtotal: string;
  items: OrderItem[];
  createdAt: string;
  submittedAt: string | null;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
  addedBy: string | null;
}

export interface Theme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  cardBackground: string;
  gradientStart: string;
  gradientEnd: string;
  gradientDirection: string;
  fontFamily: string;
  borderRadius: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  showGradientHeader: boolean;
}

export const tableApi = {
  list: async (): Promise<Table[]> => {
    const response = await apiClient.get<Table[]>('/api/admin/tables');
    return response.data;
  },

  create: async (data: { tableNumber: string; tableName?: string; capacity: number }): Promise<Table> => {
    const response = await apiClient.post<Table>('/api/admin/tables', data);
    return response.data;
  },

  update: async (id: string, data: { tableName?: string; capacity: number; active: boolean }): Promise<Table> => {
    const response = await apiClient.put<Table>(`/api/admin/tables/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/tables/${id}`);
  },

  regenerateQr: async (id: string): Promise<Table> => {
    const response = await apiClient.post<Table>(`/api/admin/tables/${id}/regenerate-qr`);
    return response.data;
  },

  createSession: async (id: string): Promise<{ sessionCode: string }> => {
    const response = await apiClient.post(`/api/admin/tables/${id}/session`);
    return response.data;
  },

  endSession: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/admin/tables/${id}/session`);
  },
};

export const orderApi = {
  listActive: async (): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>('/api/admin/orders');
    return response.data;
  },

  listAll: async (): Promise<Order[]> => {
    const response = await apiClient.get<Order[]>('/api/admin/orders/all');
    return response.data;
  },

  get: async (id: string): Promise<Order> => {
    const response = await apiClient.get<Order>(`/api/admin/orders/${id}`);
    return response.data;
  },

  confirm: async (id: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/api/admin/orders/${id}/confirm`);
    return response.data;
  },

  markPreparing: async (id: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/api/admin/orders/${id}/preparing`);
    return response.data;
  },

  markReady: async (id: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/api/admin/orders/${id}/ready`);
    return response.data;
  },

  markDelivered: async (id: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/api/admin/orders/${id}/delivered`);
    return response.data;
  },

  cancel: async (id: string): Promise<Order> => {
    const response = await apiClient.post<Order>(`/api/admin/orders/${id}/cancel`);
    return response.data;
  },
};

export const themeApi = {
  get: async (): Promise<Theme> => {
    const response = await apiClient.get<Theme>('/api/admin/theme');
    return response.data;
  },

  update: async (theme: Partial<Theme>): Promise<Theme> => {
    const response = await apiClient.put<Theme>('/api/admin/theme', theme);
    return response.data;
  },

  reset: async (): Promise<Theme> => {
    const response = await apiClient.post<Theme>('/api/admin/theme/reset');
    return response.data;
  },
};
