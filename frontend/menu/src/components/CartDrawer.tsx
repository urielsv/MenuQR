import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { useOrder } from '@/lib/OrderContext';
import { formatCurrency } from '@/lib/utils';

interface CartDrawerProps {
  qrToken: string;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; color: string; description: string }> = {
  DRAFT: { label: 'Draft', color: '#6b7280', description: 'Review and submit your order' },
  SUBMITTED: { label: 'Submitted', color: '#f59e0b', description: 'Waiting for restaurant to confirm' },
  CONFIRMED: { label: 'Confirmed', color: '#22c55e', description: 'Your order has been confirmed' },
  PREPARING: { label: 'Preparing', color: '#8b5cf6', description: 'Chef is preparing your food' },
  READY: { label: 'Ready', color: '#10b981', description: 'Your order is ready' },
  DELIVERED: { label: 'Delivered', color: '#3b82f6', description: 'Enjoy your meal!' },
  BILL_REQUESTED: { label: 'Bill Requested', color: '#f97316', description: 'Staff will bring your bill shortly' },
};

export function CartDrawer({ qrToken, onClose }: CartDrawerProps) {
  const { theme } = useTheme();
  const { order, updateQuantity, removeItem, submitOrder, requestBill, isLoading, tableNumber, sessionCode } = useOrder();
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingBill, setIsRequestingBill] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitOrder(qrToken, notes || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestBill = async () => {
    setIsRequestingBill(true);
    try {
      await requestBill(qrToken);
    } finally {
      setIsRequestingBill(false);
    }
  };

  const isOrderSubmitted = order?.status && order.status !== 'DRAFT';
  const canRequestBill = order?.status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(order.status);
  const isBillRequested = order?.status === 'BILL_REQUESTED';
  const statusInfo = statusConfig[order?.status || 'DRAFT'];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ backgroundColor: theme.cardBackground }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div 
          className="border-b px-5 py-4 sm:px-6"
          style={{ borderColor: `${theme.textColor}10` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 
                className="text-xl font-bold"
                style={{ color: theme.textColor }}
              >
                {isOrderSubmitted ? `Order #${order?.orderNumber}` : 'Your Order'}
              </h2>
              <p 
                className="mt-0.5 text-sm"
                style={{ color: `${theme.textColor}60` }}
              >
                Table {tableNumber} - Code: {sessionCode}
              </p>
            </div>
            
            {isOrderSubmitted && (
              <span 
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                style={{ backgroundColor: statusInfo.color }}
              >
                {statusInfo.label}
              </span>
            )}
          </div>

          {/* Status Banner */}
          {isOrderSubmitted && (
            <div 
              className="mt-3 rounded-xl p-3 text-center"
              style={{ backgroundColor: `${statusInfo.color}15` }}
            >
              <p 
                className="text-sm font-medium"
                style={{ color: statusInfo.color }}
              >
                {statusInfo.description}
              </p>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {!order?.items.length ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg 
                className="h-12 w-12" 
                fill="none" 
                stroke={`${theme.textColor}40`} 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4m1.6 8l-1.5 6h11l-1.5-6M7 13V8a5 5 0 0110 0v5M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <p 
                className="mt-4 text-sm"
                style={{ color: `${theme.textColor}60` }}
              >
                Your order is empty
              </p>
              <p 
                className="mt-1 text-xs"
                style={{ color: `${theme.textColor}40` }}
              >
                Browse the menu to add items
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {order.items.map((item) => (
                <div 
                  key={item.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: `${theme.textColor}05` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 
                        className="font-semibold"
                        style={{ color: theme.textColor }}
                      >
                        {item.name}
                      </h3>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {item.modifiers.map((mod) => (
                            <p 
                              key={mod.id}
                              className="text-xs"
                              style={{ color: `${theme.textColor}70` }}
                            >
                              + {mod.name}
                              {parseFloat(mod.priceAdjustment) !== 0 && (
                                <span 
                                  className="ml-1"
                                  style={{ color: theme.primaryColor }}
                                >
                                  ({parseFloat(mod.priceAdjustment) > 0 ? '+' : ''}{formatCurrency(mod.priceAdjustment)})
                                </span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                      {item.addedBy && (
                        <p 
                          className="mt-0.5 text-xs"
                          style={{ color: `${theme.textColor}60` }}
                        >
                          Added by: {item.addedBy}
                        </p>
                      )}
                      {item.notes && (
                        <p 
                          className="mt-1.5 rounded-lg px-2 py-1 text-xs italic"
                          style={{ 
                            backgroundColor: `${theme.accentColor}10`,
                            color: `${theme.textColor}70`,
                          }}
                        >
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span 
                        className="font-bold"
                        style={{ color: theme.primaryColor }}
                      >
                        {formatCurrency(item.subtotal)}
                      </span>
                      {item.quantity > 1 && (
                        <p 
                          className="text-xs"
                          style={{ color: `${theme.textColor}50` }}
                        >
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isOrderSubmitted && (
                    <div className="mt-3 flex items-center justify-between">
                      <div 
                        className="flex items-center gap-1 rounded-xl p-0.5"
                        style={{ backgroundColor: `${theme.textColor}08` }}
                      >
                        <button
                          onClick={() => updateQuantity(qrToken, item.id, item.quantity - 1)}
                          disabled={isLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold transition-colors hover:bg-white disabled:opacity-50"
                          style={{ color: theme.primaryColor }}
                        >
                          -
                        </button>
                        <span 
                          className="min-w-[2ch] text-center font-semibold"
                          style={{ color: theme.textColor }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(qrToken, item.id, item.quantity + 1)}
                          disabled={isLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold transition-colors hover:bg-white disabled:opacity-50"
                          style={{ color: theme.primaryColor }}
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(qrToken, item.id)}
                        disabled={isLoading}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Order Notes */}
          {!isOrderSubmitted && order && order.items.length > 0 && (
            <div className="mt-6">
              <label 
                className="mb-2 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: `${theme.textColor}60` }}
              >
                Special Instructions
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests for the kitchen?"
                rows={2}
                className="w-full resize-none rounded-xl border-2 px-4 py-3 text-sm outline-none transition-all"
                style={{ 
                  borderColor: `${theme.textColor}15`,
                  backgroundColor: theme.backgroundColor,
                  color: theme.textColor,
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div 
          className="border-t p-5 sm:p-6"
          style={{ borderColor: `${theme.textColor}10` }}
        >
          {/* Total */}
          <div className="mb-4 flex items-center justify-between">
            <span 
              className="text-lg font-medium"
              style={{ color: theme.textColor }}
            >
              Total
            </span>
            <span 
              className="text-2xl font-bold"
              style={{ color: theme.primaryColor }}
            >
              {formatCurrency(order?.subtotal || '0')}
            </span>
          </div>

          {/* Action Buttons */}
          {isBillRequested ? (
            <div className="space-y-3">
              <div 
                className="flex items-center justify-center gap-2 rounded-2xl py-4"
                style={{ backgroundColor: '#f9731615' }}
              >
                <Receipt className="h-5 w-5" style={{ color: '#f97316' }} />
                <span className="font-semibold" style={{ color: '#f97316' }}>
                  Bill requested - staff notified
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-2xl py-3 text-sm font-medium transition-all"
                style={{ 
                  backgroundColor: `${theme.textColor}08`,
                  color: theme.textColor,
                }}
              >
                Close
              </button>
            </div>
          ) : isOrderSubmitted ? (
            <div className="space-y-3">
              {canRequestBill && (
                <button
                  onClick={handleRequestBill}
                  disabled={isLoading || isRequestingBill}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
                  style={{ 
                    backgroundColor: '#f97316',
                    boxShadow: '0 4px 20px rgba(249, 115, 22, 0.4)',
                  }}
                >
                  {isRequestingBill ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Requesting...
                    </span>
                  ) : (
                    <>
                      <Receipt className="h-5 w-5" />
                      Request Bill
                    </>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full rounded-2xl py-3 text-sm font-medium transition-all"
                style={{ 
                  backgroundColor: `${theme.textColor}08`,
                  color: theme.textColor,
                }}
              >
                Close
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isLoading || isSubmitting || !order || order.items.length === 0}
              className="w-full rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
              style={{ 
                background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
                boxShadow: `0 4px 20px ${theme.primaryColor}40`,
              }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </span>
              ) : (
                'Submit Order'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
