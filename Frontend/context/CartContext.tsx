"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Product } from '@/lib/types';
import { useToast } from './ToastContext';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  platformFee: number;
  total: number;
  totalItemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const isCartItem = (value: unknown): value is CartItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as CartItem;
  return Boolean(item.product?.id) && Number.isFinite(item.quantity) && item.quantity > 0;
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem('asan-cart');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        setItems(Array.isArray(parsed) ? parsed.filter(isCartItem) : []);
      } catch {
        localStorage.removeItem('asan-cart');
      }
    }
  }, []);

  const saveCart = (newItems: CartItem[]) => {
    setItems(newItems);
    try {
      localStorage.setItem('asan-cart', JSON.stringify(newItems));
    } catch {
      // Storage unavailable (quota / private mode) — keep in-memory state, never crash the caller.
      showToast('Unable to save — storage unavailable', 'error');
    }
  };

  const addToCart = (product: Product, quantity: number = product.moq) => {
    if (product.stock < product.moq || product.status === 'Out of Stock') {
      showToast(`${product.name} is currently unavailable.`, 'error');
      return;
    }

    const requestedQuantity = Math.max(product.moq, Math.floor(quantity));
    const existingIndex = items.findIndex((i) => i.product.id === product.id);
    let updated: CartItem[];
    let addedQuantity: number;

    if (existingIndex > -1) {
      const existingItem = items[existingIndex];
      const newQuantity = Math.min(existingItem.quantity + requestedQuantity, product.stock);
      addedQuantity = newQuantity - existingItem.quantity;
      updated = items.map((item, index) =>
        index === existingIndex ? { ...item, quantity: newQuantity } : item
      );
    } else {
      const newQuantity = Math.min(requestedQuantity, product.stock);
      addedQuantity = newQuantity;
      updated = [...items, { product, quantity: newQuantity }];
    }

    if (addedQuantity === 0) {
      showToast(`Only ${product.stock} ${product.unit} are available.`, 'info');
      return;
    }
    saveCart(updated);
    showToast(`Added ${product.name} to cart (${addedQuantity} ${product.unit})`, 'success');
  };

  const removeFromCart = (productId: string) => {
    const updated = items.filter((i) => i.product.id !== productId);
    saveCart(updated);
    showToast('Item removed from cart', 'info');
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const item = items.find((i) => i.product.id === productId);
    if (!item) return;

    const safeQuantity = Math.floor(quantity);
    if (safeQuantity < item.product.moq) {
      showToast(`Minimum order quantity is ${item.product.moq} ${item.product.unit}.`, 'info');
      return;
    }
    const cappedQuantity = Math.min(safeQuantity, item.product.stock);
    if (cappedQuantity !== safeQuantity) {
      showToast(`Only ${item.product.stock} ${item.product.unit} are available.`, 'info');
    }

    const updated = items.map((i) =>
      i.product.id === productId ? { ...i, quantity: cappedQuantity } : i
    );
    saveCart(updated);
  };

  const clearCart = () => {
    saveCart([]);
  };

  const subtotal = items.reduce(
    (acc, curr) => acc + curr.product.price * curr.quantity,
    0
  );
  const platformFee = Math.round(subtotal * 0.015); // 1.5%
  const total = subtotal + platformFee;
  const totalItemCount = items.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
        platformFee,
        total,
        totalItemCount
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
