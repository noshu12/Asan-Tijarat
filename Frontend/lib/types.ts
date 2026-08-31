export type UserRole = 'shopkeeper' | 'supplier';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  businessName?: string;
  city?: string;
  ntn?: string;
  category?: string;
  avatar?: string;
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