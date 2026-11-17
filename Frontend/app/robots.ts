import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/shopkeeper', '/supplier', '/subadmin-setup'],
    },
    sitemap: 'https://asan-tijarat.vercel.app/sitemap.xml',
  };
}
