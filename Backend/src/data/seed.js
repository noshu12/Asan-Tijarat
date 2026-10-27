// ────────────────────────────────────────────────────────────
//  Seed script — loads the frontend's mock data into MongoDB
//  Run:  npm run seed
//  Demo logins (password = "password123" for both):
//    admin      → admin@asantijarat.pk   (Platform Administrator)
//    shopkeeper → hassan.traders@gmail.com  (M. Hassan)
//    supplier   → ahmed@akenterprises.pk   (Ahmed Khan)
// ────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const DEMO_PASSWORD = 'password123';

const ADMIN = {
  name: 'Platform Admin',
  email: 'admin@asantijarat.pk',
  phone: '03001112222',
  role: 'admin',
  businessName: 'Asan Tijarat Operations',
  city: 'Islamabad',
  ntn: '9999999-9',
  category: 'Platform Administration',
  verified: true,
};

const USERS = [
  {
    name: 'M. Hassan',
    email: 'hassan.traders@gmail.com',
    phone: '03214567890', // matches the /signin prefill
    role: 'shopkeeper',
    businessName: 'Hassan Wholesale Mart',
    city: 'Karachi',
    houseAddress: 'House 123, Street 4, Block B, Gulshan-e-Iqbal',
    currentHouseLocation: 'Gulshan-e-Iqbal, Karachi, Sindh',
    currentLocation: { lat: 24.9227, lng: 67.0764 },
    ntn: '8945123-4',
    category: 'Rice & Grains, Spices',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&h=150&fit=crop',
    verified: true,
  },
  {
    name: 'Ahmed Khan',
    email: 'ahmed@akenterprises.pk',
    phone: '+92 300 1234567',
    role: 'supplier',
    businessName: 'Ahmed Khan Enterprises',
    city: 'Lahore',
    houseAddress: 'House 123, Street 4, Block B, Model Town',
    currentHouseLocation: 'Model Town, Lahore, Punjab',
    currentLocation: { lat: 31.4697, lng: 74.2728 },
    ntn: '1234567-8',
    category: 'Rice & Grains, Spices, Textiles',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop',
    verified: true,
  },
];

// Formatted as displayed in the frontend marketplace.
// supplierId is attached to the seeded supplier account so the
// supplier portal (My Products / Orders) has live demo rows.
const PRODUCTS = [
  {
    name: 'Basmati Rice Premium Super Kernel (Grade A)',
    category: 'Rice & Grains',
    price: 4500,
    unit: '50kg bag',
    moq: 10,
    stock: 850,
    supplierName: 'Punjab Agri Exports',
    supplierCity: 'Sheikhupura',
    supplierVerified: true,
    rating: 4.8,
    reviewCount: 234,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=640&h=640&fit=crop',
    description: 'Aromatic extra long grain super kernel basmati rice aged for 12 months. Ideal for commercial restaurants, catering, and wholesale distribution across Pakistan.',
    ordersCount: 124,
    status: 'Active',
    isTrending: true,
    aiReason: 'High demand in your region this season (Punjab & Sindh)',
  },
  {
    name: 'Lahori Red Chilli Powder (Steam Sterilized)',
    category: 'Spices',
    price: 2200,
    unit: '5kg pack',
    moq: 5,
    stock: 320,
    supplierName: 'Multan Masala House',
    supplierCity: 'Multan',
    supplierVerified: true,
    rating: 4.6,
    reviewCount: 189,
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=640&h=640&fit=crop',
    description: '100% pure organic red chilli powder ground from sun-dried whole chillies. Rich natural color and intense pungency with zero artificial coloring.',
    ordersCount: 89,
    status: 'Active',
    isTrending: true,
    aiReason: 'Popular with customers who ordered Basmati Rice',
  },
  {
    name: 'Cotton Fabric White Shirting (Export Quality)',
    category: 'Textiles',
    price: 850,
    unit: '100m roll',
    moq: 10,
    stock: 4500,
    supplierName: 'Faisalabad Textile Mills',
    supplierCity: 'Faisalabad',
    supplierVerified: true,
    rating: 4.9,
    reviewCount: 412,
    image: 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=640&h=640&fit=crop',
    description: 'Premium comb cotton fabric 60/60 weave, crisp white finish with high durability and soft breathability for garment manufacturing.',
    ordersCount: 203,
    status: 'Active',
    isTrending: true,
    aiReason: 'Trending among Karachi wholesale apparel markets',
  },
  {
    name: 'Desi Ghee Pure Buffalo (Traditional Bilona)',
    category: 'Dairy',
    price: 3800,
    unit: '5kg tin',
    moq: 5,
    stock: 120,
    supplierName: 'Gujranwala Dairy Farm',
    supplierCity: 'Gujranwala',
    supplierVerified: true,
    rating: 4.5,
    reviewCount: 98,
    image: 'https://images.unsplash.com/photo-1631451095765-2c91616fc9e6?w=640&h=640&fit=crop',
    description: 'Pure, golden, aromatic desi ghee crafted using traditional churning methods. Lab-tested purity with zero preservatives.',
    ordersCount: 76,
    status: 'Low Stock',
    isTrending: false,
    aiReason: 'Seasonal peak approaching next month',
  },
  {
    name: 'Himalayan Pink Rock Salt (Food Grade Coarse)',
    category: 'Minerals',
    price: 180,
    unit: '50kg bag',
    moq: 20,
    stock: 2400,
    supplierName: 'Khewra Salt Mines Co.',
    supplierCity: 'Khewra',
    supplierVerified: true,
    rating: 4.7,
    reviewCount: 567,
    image: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=640&h=640&fit=crop',
    description: 'Natural unrefined Himalayan pink salt packed with 84 essential minerals directly sourced from Khewra mines.',
    ordersCount: 310,
    status: 'Active',
    isTrending: true,
    aiReason: '4,820 wholesale searches recorded this week',
  },
  {
    name: 'Sindhi Red Onions Premium (Grade 1)',
    category: 'Vegetables',
    price: 120,
    unit: '100kg crate',
    moq: 10,
    stock: 950,
    supplierName: 'Hyderabad Fresh Farms',
    supplierCity: 'Hyderabad',
    supplierVerified: true,
    rating: 4.4,
    reviewCount: 156,
    image: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?w=640&h=640&fit=crop',
    description: 'Freshly harvested firm red onions from Sindh farm fields. Excellent storage life and strong pungent aroma.',
    ordersCount: 92,
    status: 'Active',
    isTrending: false,
    aiReason: 'High turnover rate in daily mandis',
  },
  {
    name: 'Sunflower Cooking Oil (Refined Pure 15L)',
    category: 'Dairy & Oils',
    price: 5200,
    unit: '15L Can',
    moq: 10,
    stock: 650,
    supplierName: 'Lahore Oils Ltd.',
    supplierCity: 'Lahore',
    supplierVerified: true,
    rating: 4.8,
    reviewCount: 320,
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=640&h=640&fit=crop',
    description: 'Triple-refined vitamin A & D enriched 100% sunflower cooking oil for industrial and commercial kitchens.',
    ordersCount: 184,
    status: 'Active',
    isTrending: true,
    aiReason: 'High demand in your region this season',
  },
  {
    name: 'Refined Sugar Crystal White 50kg',
    category: 'Rice & Grains',
    price: 6800,
    unit: '50kg bag',
    moq: 15,
    stock: 1500,
    supplierName: 'Mirpur Khas Sugar Mills',
    supplierCity: 'Mirpur Khas',
    supplierVerified: true,
    rating: 4.6,
    reviewCount: 210,
    image: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=640&h=640&fit=crop',
    description: 'Grade 1 refined white crystalline cane sugar with sparkling purity and instant solubility.',
    ordersCount: 145,
    status: 'Active',
    isTrending: false,
    aiReason: 'You ordered similar staple products 3 months ago',
  },
  {
    name: 'Wheat Flour Maida Super Fine 50kg',
    category: 'Rice & Grains',
    price: 3200,
    unit: '50kg bag',
    moq: 15,
    stock: 2100,
    supplierName: 'Rawalpindi Flour Mills',
    supplierCity: 'Rawalpindi',
    supplierVerified: true,
    rating: 4.7,
    reviewCount: 388,
    image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=640&h=640&fit=crop',
    description: 'Double-sifted high gluten wheat flour ideal for bakeries, tandoors, and confectionery production.',
    ordersCount: 260,
    status: 'Active',
    isTrending: true,
    aiReason: 'Trending among Karachi & Lahore shopkeepers',
  },
];

const ORDERS = [
  {
    orderNumber: 'AT-2026-001',
    buyerName: 'Karachi Traders Co.',
    supplierName: 'Punjab Agri Exports',
    items: [
      {
        productId: 'prod_1',
        productName: 'Basmati Rice Premium Super Kernel (Grade A)',
        productImage: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=640&h=640&fit=crop',
        unitPrice: 4500,
        quantity: 50,
        unit: '50kg bag',
        supplierName: 'Punjab Agri Exports',
      },
    ],
    subtotal: 225000,
    platformFee: 3375,
    totalAmount: 228375,
    status: 'Delivered',
    createdAt: '2026-07-01T10:30:00Z',
    deliveryDate: '2026-07-04T15:00:00Z',
    shippingAddress: 'Plot 45, Jodia Bazaar, Wholesale Market, Karachi',
    paymentMethod: 'JazzCash',
    paymentStatus: 'Paid',
  },
  {
    orderNumber: 'AT-2026-002',
    buyerName: 'Lahore Wholesale Hub',
    supplierName: 'Faisalabad Textile Mills',
    items: [
      {
        productId: 'prod_3',
        productName: 'Cotton Fabric White Shirting (Export Quality)',
        productImage: 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=640&h=640&fit=crop',
        unitPrice: 850,
        quantity: 800,
        unit: '100m roll',
        supplierName: 'Faisalabad Textile Mills',
      },
    ],
    subtotal: 680000,
    platformFee: 10200,
    totalAmount: 690200,
    status: 'Shipped',
    createdAt: '2026-06-28T09:15:00Z',
    deliveryDate: '2026-07-06T12:00:00Z',
    shippingAddress: 'Shop 12, Azam Cloth Market, Lahore',
    paymentMethod: 'Bank Transfer',
    paymentStatus: 'Paid',
  },
  {
    orderNumber: 'AT-2026-003',
    buyerName: 'Multan Spice Mart',
    supplierName: 'Multan Masala House',
    items: [
      {
        productId: 'prod_2',
        productName: 'Lahori Red Chilli Powder (Steam Sterilized)',
        productImage: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=640&h=640&fit=crop',
        unitPrice: 2200,
        quantity: 30,
        unit: '5kg pack',
        supplierName: 'Multan Masala House',
      },
    ],
    subtotal: 66000,
    platformFee: 990,
    totalAmount: 66990,
    status: 'Confirmed',
    createdAt: '2026-06-27T14:45:00Z',
    deliveryDate: '2026-07-08T18:00:00Z',
    shippingAddress: 'Galla Mandi Road, Multan',
    paymentMethod: 'EasyPaisa',
    paymentStatus: 'Paid',
  },
];

async function seed() {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[seed] connected → ${mongoose.connection.name}`);

  // Fresh state
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Order.deleteMany({})]);
  console.log('[seed] cleared users / products / orders');

  // 1) Users (password hashing handled automatically by the model hook)
  const admin = await User.create({ ...ADMIN, password: DEMO_PASSWORD });
  const shopkeeper = await User.create({ ...USERS[0], password: DEMO_PASSWORD });
  const supplier = await User.create({ ...USERS[1], password: DEMO_PASSWORD });
  console.log(`[seed] users → admin=${admin.email}  shopkeeper=${shopkeeper.email}  supplier=${supplier.email} (password: ${DEMO_PASSWORD})`);

  // 2) Products — every listing owned by the demo supplier account
  const products = await Product.insertMany(
    PRODUCTS.map((p) => ({ ...p, supplierId: supplier._id }))
  );
  console.log(`[seed] products → ${products.length} listings seeded`);

  // 3) Orders — buyer = demo shopkeeper, supplier = demo supplier
  const orders = await Order.insertMany(
    ORDERS.map((o) => ({
      ...o,
      buyerId: shopkeeper._id,
      buyerRole: 'shopkeeper',
      supplierId: supplier._id,
    }))
  );
  console.log(`[seed] orders → ${orders.length} orders seeded`);

  await mongoose.disconnect();
  console.log('[seed] ✅ done — run `npm start` and open http://localhost:5000/api/health');
}

seed().catch((err) => {
  console.error('[seed] ❌ failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});