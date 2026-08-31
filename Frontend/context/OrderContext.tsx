"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Order, OrderStatus, User } from '@/lib/types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  getFallbackOrders,
  persistOrders,
  readStoredOrders,
  withOrderStatus,
  withPlacedOrders,
} from '@/services/orderService';

interface OrderContextType {
  orders: Order[];
  placeOrders: (buyer: User, items: CartItem[], paymentMethod: Order['paymentMethod'], shippingAddress: string) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(getFallbackOrders());
  const { user } = useAuth();
  const { showToast } = useToast();

  // Offline-cache hydrate on mount (all storage/API handling lives in orderService).
  useEffect(() => {
    const stored = readStoredOrders();
    if (stored) setOrders(stored);
  }, []);

  const saveOrders = (nextOrders: Order[]) => {
    setOrders(nextOrders);
    persistOrders(nextOrders);
  };

  /**
   * Fans the cart out into one escrow-backed order per supplier.
   * MOCK OF: POST /api/orders — grouping/totals math moved into orderService.
   */
  const placeOrders = (
    buyer: User,
    items: CartItem[],
    paymentMethod: Order['paymentMethod'],
    shippingAddress: string
  ) => {
    saveOrders(withPlacedOrders(orders, { buyer, items, paymentMethod, shippingAddress }));
  };

  /**
   * Advances an order along its pipeline. MOCK OF: PATCH /api/orders/:id/status
   * Client-side ownership guard: suppliers may only touch their own orders,
   * buyers (shopkeepers) only their own purchases — the real API re-checks.
   */
  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const order = orders.find((o) => o.id === orderId);
    const isOwner =
      !!user &&
      !!order &&
      ((user.role === 'supplier' && order.supplierId === user.id) ||
        (user.role === 'shopkeeper' && order.buyerId === user.id));
    if (!isOwner) {
      showToast("You don't have permission to update this order", 'error');
      return;
    }
    saveOrders(withOrderStatus(orders, orderId, status));
  };

  return (
    <OrderContext.Provider value={{ orders, placeOrders, updateOrderStatus }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrders must be used within OrderProvider');
  return context;
}
