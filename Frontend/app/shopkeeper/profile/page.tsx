"use client";

import React from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { ProfileView } from '@/components/ProfileView';

/**
 * Shopkeeper business profile — previously this route did not exist at all
 * (the sidebar linked nowhere), so deep-linking `/shopkeeper/profile` returned
 * a 404. All data now comes from the signed-in session, not mock data.
 */
export default function ShopkeeperProfilePage() {
  return (
    <div className="space-y-8">
      {/* Bell fix — the bell lives in PortalHeader; ProfileView no longer
          renders its own title block (see components/ProfileView.tsx). */}
      <PortalHeader title="Business Profile" subtitle="Shopkeeper Portal" />
      <ProfileView role="shopkeeper" />
    </div>
  );
}
