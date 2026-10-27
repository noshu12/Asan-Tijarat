import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Order, User } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Google Maps URL for a trader's captured GPS point (`currentLocation`).
 * Falls back to a Google Maps *search* on the written location text when no
 * coordinates exist, so the Admin Dashboard always offers a working map link
 * whenever either piece of information was provided.
 */
export function googleMapsUrl(user: Pick<User, 'currentLocation' | 'currentHouseLocation'>): string | null {
  const point = user.currentLocation;
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }
  const text = (user.currentHouseLocation || '').trim();
  if (text) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
  }
  return null;
}

/**
 * Google Maps URL attached to an order (shopkeeper's delivery location).
 * Prefers the link the backend already built (`buyerLocationLink`), then
 * rebuilds it from the stored GPS point, and finally falls back to a Maps
 * search on the written shipping address — so a supplier can always tap
 * through to Google Maps from an order.
 */
export function orderGoogleMapsUrl(
  order: Pick<Order, 'buyerLocation' | 'buyerLocationLink' | 'shippingAddress'>
): string | null {
  const link = (order.buyerLocationLink || '').trim();
  if (link) return link;
  const point = order.buyerLocation;
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }
  const text = (order.shippingAddress || '').trim();
  if (text) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
  }
  return null;
}

export function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(amount).replace('PKR', 'Rs');
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/** 1.4 MB / 812 KB — used by the KYC upload previews and admin document cards. */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}