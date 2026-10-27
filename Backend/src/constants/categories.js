/**
 * Master categories for Asan Tijarat — ONLY these 14.
 *
 * No separate selectable subcategories. Items inside a
 * department (Rice, Daal, Oil, Biscuits, etc) are PRODUCTS
 * under that department, not categories.
 *
 * Supplier account creation: the dropdown offers these 14
 * and the supplier multi-selects all that he sells — the
 * User model will store them as a LIST, not one string.
 *
 * Pack sizes (1kg, 5kg, 10kg, etc) are product unit/price
 * fields, not categories. No products are seeded from here.
 */
const CATEGORIES = [
  'Staples, Grains & Flours',
  'Pulses, Lentils & Beans',
  'Cooking Oils, Ghee & Fats',
  'Spices, Herbs & Baking',
  'Packaged Foods, Recipe Mixes & Sauces',
  'Beverages & Cold Corner',
  'Tea, Coffee & Dairy',
  'Snacks, Biscuits & Confectionery',
  'Instant & Ready-to-Cook Foods',
  'Home Cleaning & Sanitation',
  'Personal Care & Hygiene',
  'Mother & Baby Care',
  'Paper Products, Wraps & Utilities',
  'Over-the-Counter Healthcare',
];

module.exports = { CATEGORIES, MAIN_CATEGORIES: CATEGORIES };
