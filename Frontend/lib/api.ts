import type { DeviceLocation, KycDocuments, Order, OrderStatus, Product, ProductImageUpload, User, UserRole } from './types';

/**
 * API client — every call mirrors an Express endpoint on the backend
 * (Express + MongoDB, `Backend/` folder):
 *
 *   Auth      POST /api/auth/login | /register | GET /api/auth/me
 *   Products  GET/POST /api/products | GET/PATCH/DELETE /api/products/:id
 *   Orders    POST/GET /api/orders | GET /api/orders/:id | PATCH /api/orders/:id/status
 *
 * Success: returns the parsed JSON payload.
 * Failure: throws ApiError with `code` + `message` from the server envelope.
 */

export const API_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:5000';

/**
 * Turns a stored document path (`/uploads/kyc/cnicFront-…jpg`) into the URL an
 * <img>/<iframe> can load. Absolute URLs and data URLs pass through untouched.
 */
export function fileUrl(pathname?: string | null): string {
  if (!pathname) return '';
  if (/^(https?:|data:|blob:)/i.test(pathname)) return pathname;
  return `${API_URL}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the API server. Start the backend (npm start in Backend/) and refresh. ' +
        'If it is already running, this page’s origin is probably not allowed by the server’s ' +
        'CORS config (CLIENT_ORIGIN in Backend/.env) — open the app on http://localhost:3000.'
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    const errorPayload = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      errorPayload?.code || 'REQUEST_FAILED',
      errorPayload?.message || `Request failed with status ${response.status}`
    );
  }

  return payload as T;
}

/* ── Payload types ─────────────────────────────────────────────────── */

/** One uploaded file as sent to the API: a base64 data URL + the original name. */
export interface UploadPayload {
  dataUrl: string;
  name: string;
}

/** Back-compat alias used by the registration (KYC) flow. */
export type KycDocumentPayload = UploadPayload;

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  businessName?: string;
  city?: string;
  ntn?: string;
  category?: string;
  avatar?: string;
  /** Residential details collected in Step 1 of registration. */
  houseAddress?: string;
  currentHouseLocation?: string;
  /** GPS point captured from the device via the browser Geolocation API. */
  currentLocation?: DeviceLocation;
  /** Step-3 uploads: CNIC front, CNIC back and the NTN certificate. */
  documents?: Partial<Record<'cnicFront' | 'cnicBack' | 'ntn', KycDocumentPayload>>;
}

/** Editable fields on PATCH /api/auth/me — role/verified are admin-only. */
export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  city?: string;
  ntn?: string;
  category?: string;
  avatar?: string;
  houseAddress?: string;
  currentHouseLocation?: string;
  /** GPS point — `null` clears the stored coordinates. */
  currentLocation?: DeviceLocation | null;
}

export interface CreateOrderPayload {
  items: { productId: string; quantity: number }[];
  shippingAddress: string;
  /**
   * Shopkeeper's GPS point captured at checkout — stored on the order and
   * rendered for the supplier as a Google Maps link (buyerLocationLink).
   */
  currentLocation?: { lat: number; lng: number } | null;
}

export interface ProductQuery {
  search?: string;
  category?: string;
  sort?: 'price-asc' | 'price-desc';
}

/**
 * Body of POST/PATCH /api/products. `images` carries photos picked from the
 * supplier's device (base64 data URLs); plain strings are treated as already
 * stored URLs. Photo #1 becomes the listing's cover image.
 */
export interface ProductWritePayload {
  name?: string;
  category?: string;
  price?: number;
  unit?: string;
  moq?: number;
  stock?: number;
  status?: Product['status'];
  description?: string;
  image?: UploadPayload | string;
  images?: Array<UploadPayload | string>;
}

/** Response of POST/PATCH /api/products — includes the stored photo metadata. */
export interface ProductWriteResponse {
  product: Product & { imageUploads?: ProductImageUpload[] };
}

/* ── Admin payload types (mirror Backend /api/admin/*) ─────────────── */

export interface AdminStats {
  users: number;
  suppliers: number;
  shopkeepers: number;
  pendingVerifications: number;
  products: number;
  orders: number;
  revenue: number;
}

export interface AdminUser extends User {
  createdAt?: string;
  updatedAt?: string;
  /** Account lifecycle status from the backend User model. */
  status?: 'pending' | 'active' | 'suspended' | 'rejected';
  /** Admin-written reason for the last suspend, if any. */
  suspensionReason?: string;
  /** Admin-written reason for the rejection, if any. */
  rejectionReason?: string;
}

/* ── API surface ──────────────────────────────────────────────────── */

export const api = {
  login: (identifier: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
      auth: false,
    }),

  /** Clears the httpOnly session cookie on the server. */
  logout: () => request<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    auth: false,
  }),

  /**
   * Creates a PENDING account (no JWT returned). The shopkeeper/supplier must
   * be verified by an admin before they can sign in.
   */
  register: (payload: RegisterPayload) =>
    request<{ user: User; verified: boolean; message: string; documents?: KycDocuments }>('/api/auth/register', {
      method: 'POST',
      body: payload,
      auth: false,
    }),

  me: () => request<{ user: User }>('/api/auth/me'),

  /**
   * Self-service profile update — PATCH /api/auth/me.
   * `role` and `verified` are not accepted here (admin-only fields).
   */
  updateProfile: (payload: ProfileUpdatePayload) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: payload }),

  /** Verifies the current password server-side before replacing it. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ updated: boolean }>('/api/auth/me/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),

  /** Sends a password-reset request — token is emailed, never returned here. */
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    }),

  /** Resets the password with the token from the forgot-password request. */
  resetPassword: (token: string, newPassword: string) =>
    request<{ reset: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
      auth: false,
    }),

  /** Sends a 6-digit email OTP via SMTP. */
  sendOtp: (email: string) =>
    request<{ message: string }>('/api/auth/send-otp', {
      method: 'POST',
      body: { email },
      auth: false,
    }),

  /** Verifies the 6-digit email OTP — sets emailVerified only, admin approval still required. */
  verifyOtp: (email: string, otp: string) =>
    request<{ emailVerified: boolean; message: string }>('/api/auth/verify-otp', {
      method: 'POST',
      body: { email, otp },
      auth: false,
    }),

  products: (query: ProductQuery = {}) => {
    const params = new URLSearchParams();
    const search = (query.search || '').trim();
    if (search) params.set('search', search);
    if (query.category && query.category !== 'all') params.set('category', query.category);
    // Backend sort keys differ slightly from the UI dropdown labels.
    const SORT_MAP = {
      'price-asc': 'price_asc',
      'price-desc': 'price_desc',
    } as const;
    if (query.sort) params.set('sort', SORT_MAP[query.sort]);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ products: Product[]; count: number }>(`/api/products${suffix}`, { auth: false });
  },

  product: (id: string) =>
    request<{ product: Product }>(`/api/products/${id}`, { auth: false }),

  createProduct: (payload: ProductWritePayload) =>
    request<{ product: Product }>('/api/products', { method: 'POST', body: payload }),

  updateProduct: (id: string, payload: ProductWritePayload) =>
    request<{ product: Product }>(`/api/products/${id}`, { method: 'PATCH', body: payload }),

  deleteProduct: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/api/products/${id}`, { method: 'DELETE' }),

  orders: () => request<{ orders: Order[]; count: number }>('/api/orders'),

  createOrder: (payload: CreateOrderPayload) =>
    request<{ orders: Order[]; count: number }>('/api/orders', { method: 'POST', body: payload }),

  /**
   * Friendly alias used by the shopkeeper cart — POST /api/orders creates
   * ONE order per supplier and returns { orders, count }.
   */
  placeOrder: (payload: CreateOrderPayload) =>
    request<{ orders: Order[]; count: number }>('/api/orders', { method: 'POST', body: payload }),

  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<{ order: Order }>(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } }),

  /* ── Admin API (requires an admin session) ────────────────────────── */
  admin: {
    stats: () => request<{ stats: AdminStats; recentOrders: Order[] }>('/api/admin/stats'),

    users: (query: { role?: string; verified?: string; search?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.role && query.role !== 'all') params.set('role', query.role);
      if (query.verified === 'true' || query.verified === 'false') params.set('verified', query.verified);
      if (query.search) params.set('search', query.search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{ users: AdminUser[]; count: number }>(`/api/admin/users${suffix}`);
    },

    verifyUser: (id: string, verified: boolean) =>
      request<{ user: AdminUser }>(`/api/admin/users/${id}/verify`, { method: 'PATCH', body: { verified } }),

    suspendUser: (id: string, reason: string) =>
      request<{ user: AdminUser }>(`/api/admin/users/${id}/suspend`, { method: 'PATCH', body: { reason } }),

    activateUser: (id: string) =>
      request<{ user: AdminUser }>(`/api/admin/users/${id}/activate`, { method: 'PATCH' }),

    rejectUser: (id: string, reason: string) =>
      request<{ user: AdminUser }>(`/api/admin/users/${id}/reject`, { method: 'PATCH', body: { reason } }),

    deleteUser: (id: string) =>
      request<{ deleted: boolean; id: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

    products: (query: { search?: string; status?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.status && query.status !== 'all') params.set('status', query.status);
      if (query.search) params.set('search', query.search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{ products: Product[]; count: number }>(`/api/admin/products${suffix}`);
    },

    deleteProduct: (id: string) =>
      request<{ product: Product }>(`/api/admin/products/${id}`, { method: 'DELETE' }),

    orders: (query: { status?: string; search?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.status && query.status !== 'all') params.set('status', query.status);
      if (query.search) params.set('search', query.search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{ orders: Order[]; count: number }>(`/api/admin/orders${suffix}`);
    },

    updateOrderStatus: (id: string, status: OrderStatus) =>
      request<{ order: Order }>(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
  },
};
