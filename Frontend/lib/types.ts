export type UserRole = 'shopkeeper' | 'supplier' | 'admin';

/**
 * One file stored by the API's upload helpers (KYC documents, product photos).
 * `url` is served by the backend at `/uploads/...` — use `fileUrl()` from
 * `lib/api.ts` to build the absolute URL for <img>/<a> tags.
 */
export interface UploadedFile {
  url: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
}

/** A registration KYC document (CNIC front/back, NTN certificate). */
export type KycDocument = UploadedFile;

/**
 * GPS point captured from the trader's device via the browser Geolocation API.
 * Stored on the account as `currentLocation` and rendered in the Admin
 * Dashboard as a clickable Google Maps link.
 */
export interface DeviceLocation {
  lat: number;
  lng: number;
  capturedAt?: string;
}

/** The three compliance documents both shopkeepers and suppliers submit. */
export interface KycDocuments {
  cnicFront?: KycDocument;
  cnicBack?: KycDocument;
  ntn?: KycDocument;
}

/** A photo the supplier uploaded with a listing (mirrors Product.imageUploads). */
export interface ProductImageUpload extends UploadedFile {}

/** Which of the three uploads a UI element refers to. */
export type KycDocumentKey = 'cnicFront' | 'cnicBack' | 'ntn';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  businessName?: string;
  city?: string;
  /** Complete residential address submitted at registration. */
  houseAddress?: string;
  /** Where the trader is currently living (area/city reference for admins). */
  currentHouseLocation?: string;
  /** GPS point captured from the device — shown as a Google Maps link. */
  currentLocation?: DeviceLocation | null;
  ntn?: string;
  category?: string;
  avatar?: string;
  /** CNIC front/back + NTN uploads — rendered in the Admin Dashboard. */
  documents?: KycDocuments;
  verified?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  moq: number; // Minimum Order Quantity
  stock: number;
  supplierId: string;
  supplierName: string;
  supplierCity: string;
  supplierVerified: boolean;
  rating: number;
  reviewCount: number;
  image: string;
  additionalImages?: string[];
  /** Metadata of the photos the supplier uploaded for this listing (mirrors the backend). */
  imageUploads?: ProductImageUpload[];
  description: string;
  ordersCount: number;
  status: 'Active' | 'Low Stock' | 'Out of Stock';
  isTrending?: boolean;
  aiReason?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  unit: string;
  supplierName: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  buyerName: string;
  buyerRole: UserRole;
  supplierId: string;
  supplierName: string;
  items: OrderItem[];
  subtotal: number;
  platformFee: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  deliveryDate?: string;
  shippingAddress: string;
  /**
   * Shopkeeper's GPS point captured at checkout — sent with the order so the
   * supplier can navigate to the exact delivery spot.
   */
  buyerLocation?: DeviceLocation | null;
  /** Prebuilt Google Maps URL for `buyerLocation` (clickable by suppliers). */
  buyerLocationLink?: string | null;
  paymentMethod: 'JazzCash' | 'EasyPaisa' | 'Card' | 'Bank Transfer';
  paymentStatus: 'Paid' | 'Pending' | 'Refunded';
}

export interface TopSupplier {
  id: string;
  name: string;
  initials: string;
  rating: number;
  ordersCount: number;
  tradeVolume: number;
  verified: boolean;
}