"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product, User } from '@/lib/types';
import {
  CreateProductInput,
  UpdateProductInput,
  getFallbackCatalogue,
  readStoredCatalogue,
  persistCatalogue,
  withCreatedProduct,
  withRemovedProduct,
  withUpdatedProduct,
} from '@/services/productService';

interface ProductContextType {
  products: Product[];
  createProduct: (product: CreateProductInput, supplier: User) => void;
  updateProduct: (productId: string, patch: UpdateProductInput) => void;
  removeProduct: (productId: string) => void;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(getFallbackCatalogue());

  // Offline-cache hydrate on mount (all storage/API handling lives in productService).
  useEffect(() => {
    const stored = readStoredCatalogue();
    if (stored) setProducts(stored);
  }, []);

  const saveCatalogue = (nextCatalogue: Product[]) => {
    setProducts(nextCatalogue);
    persistCatalogue(nextCatalogue);
  };

  /** MOCK OF: POST /api/products */
  const createProduct = (product: CreateProductInput, supplier: User) => {
    saveCatalogue(withCreatedProduct(products, product, supplier));
  };

  /** MOCK OF: PATCH /api/products/:id — supplier edits (price/stock/MOQ/status). */
  const updateProduct = (productId: string, patch: UpdateProductInput) => {
    saveCatalogue(withUpdatedProduct(products, productId, patch));
  };

  /** MOCK OF: DELETE /api/products/:id */
  const removeProduct = (productId: string) => {
    saveCatalogue(withRemovedProduct(products, productId));
  };

  return (
    <ProductContext.Provider value={{ products, createProduct, updateProduct, removeProduct }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (!context) throw new Error('useProducts must be used within ProductProvider');
  return context;
}
