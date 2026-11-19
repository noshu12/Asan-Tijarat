import type { MetadataRoute } from 'next';

const baseUrl = 'https://asan-tijarat.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  // lastModified matches the last git change to each public page (2026-11-17).
  const lastModified = new Date('2026-11-17');
  return [
    { url: `${baseUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/marketplace`, lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/getstarted`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/signin`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/forgot-password`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/reset-password`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
