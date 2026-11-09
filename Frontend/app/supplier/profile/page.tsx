"use client";

import React from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { ProfileView } from '@/components/ProfileView';

/**
 * Supplier business profile.
 *
 * Previously rendered `INITIAL_USERS.supplier` from `lib/mockData`, so every
 * supplier account saw the same hardcoded demo company. It is now driven by
 * the signed-in session (GET /api/auth/me) and the account's own listings.
 */
export default function SupplierProfilePage() {
  return (
    <div className="space-y-8">
      {/* Bell fix — the bell lives in PortalHeader; ProfileView no longer
          renders its own title block (see components/ProfileView.tsx). */}
      <PortalHeader title="Business Profile" subtitle="Supplier Portal" />
      <ProfileView role="supplier" />
    </div>
  );
}
