"use client";

import React from 'react';
import { ProfileView } from '@/components/ProfileView';

/**
 * Shopkeeper business profile — previously this route did not exist at all
 * (the sidebar linked nowhere), so deep-linking `/shopkeeper/profile` returned
 * a 404. All data now comes from the signed-in session, not mock data.
 */
export default function ShopkeeperProfilePage() {
  return <ProfileView role="shopkeeper" />;
}
