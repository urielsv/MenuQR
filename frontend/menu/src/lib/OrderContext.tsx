import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi } from '@/shared/api/menuApi';
import type { OrderResponse, OrderItemResponse } from '@/shared/types';

interface OrderContextValue {
  order: OrderResponse | null;
  sessionId: string | null;
  sessionCode: string | null;
  tableNumber: string | null;
  isLoading: boolean;
  setSession: (sessionId: string, sessionCode: string, tableNumber: string) => void;
  setOrder: (order: OrderResponse | null) => void;
  addItem: (qrToken: string, menuItemId: string, name: string, price: string, quantity: number, notes?: string, guestName?: string, selectedModifierIds?: string[]) => Promise<void>;
  updateQuantity: (qrToken: string, itemId: string, quantity: number) => Promise<void>;
  removeItem: (qrToken: string, itemId: string) => Promise<void>;
  submitOrder: (qrToken: string, notes?: string) => Promise<void>;
  getItemCount: () => number;
  getTotal: () => string;
}

const OrderContext = createContext<OrderContextValue | null>(null);

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrder must be used within OrderProvider');
  return ctx;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);

  const addItemMutation = useMutation({
    mutationFn: async ({ qrToken, menuItemId, quantity, notes, guestName, selectedModifierIds }: {
      qrToken: string;
      menuItemId: string;
      quantity: number;
      notes?: string;
      guestName?: string;
      selectedModifierIds?: string[];
    }) => {
      if (!sessionId) throw new Error('No session');
      return menuApi.addItem(qrToken, sessionId, menuItemId, quantity, notes, guestName, selectedModifierIds);
    },
    onSuccess: (data) => setOrder(data),
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ qrToken, itemId, quantity }: {
      qrToken: string;
      itemId: string;
      quantity: number;
    }) => {
      if (!sessionId) throw new Error('No session');
      return menuApi.updateItemQuantity(qrToken, itemId, sessionId, quantity);
    },
    onSuccess: (data) => setOrder(data),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ qrToken, itemId }: { qrToken: string; itemId: string }) => {
      if (!sessionId) throw new Error('No session');
      await menuApi.removeItem(qrToken, itemId, sessionId);
      const updatedOrder = await menuApi.getOrder(qrToken, sessionId);
      return updatedOrder;
    },
    onSuccess: (data) => setOrder(data),
  });

  const submitOrderMutation = useMutation({
    mutationFn: async ({ qrToken, notes }: { qrToken: string; notes?: string }) => {
      if (!sessionId) throw new Error('No session');
      return menuApi.submitOrder(qrToken, sessionId, notes);
    },
    onSuccess: (data) => setOrder(data),
  });

  const setSession = useCallback((sid: string, code: string, table: string) => {
    setSessionId(sid);
    setSessionCode(code);
    setTableNumber(table);
  }, []);

  const addItem = useCallback(async (
    qrToken: string,
    menuItemId: string,
    name: string,
    price: string,
    quantity: number,
    notes?: string,
    guestName?: string,
    selectedModifierIds?: string[]
  ) => {
    await addItemMutation.mutateAsync({ qrToken, menuItemId, quantity, notes, guestName, selectedModifierIds });
  }, [addItemMutation]);

  const updateQuantity = useCallback(async (qrToken: string, itemId: string, quantity: number) => {
    await updateQuantityMutation.mutateAsync({ qrToken, itemId, quantity });
  }, [updateQuantityMutation]);

  const removeItem = useCallback(async (qrToken: string, itemId: string) => {
    await removeItemMutation.mutateAsync({ qrToken, itemId });
  }, [removeItemMutation]);

  const submitOrder = useCallback(async (qrToken: string, notes?: string) => {
    await submitOrderMutation.mutateAsync({ qrToken, notes });
  }, [submitOrderMutation]);

  const getItemCount = useCallback(() => {
    return order?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
  }, [order]);

  const getTotal = useCallback(() => {
    return order?.subtotal || '0.00';
  }, [order]);

  const isLoading = addItemMutation.isPending || 
    updateQuantityMutation.isPending || 
    removeItemMutation.isPending || 
    submitOrderMutation.isPending;

  return (
    <OrderContext.Provider value={{
      order,
      sessionId,
      sessionCode,
      tableNumber,
      isLoading,
      setSession,
      setOrder,
      addItem,
      updateQuantity,
      removeItem,
      submitOrder,
      getItemCount,
      getTotal,
    }}>
      {children}
    </OrderContext.Provider>
  );
}
