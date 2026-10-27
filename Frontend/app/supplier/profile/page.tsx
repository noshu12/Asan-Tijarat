"use client";

import React from 'react';
import { ProfileView } from '@/components/ProfileView';

/**
 * Supplier business profile.
 *
 * Previously rendered `INITIAL_USERS.supplier` from `lib/mockData`, so every
 * supplier account saw the same hardcoded demo company. It is now driven by
 * the signed-in session (GET /api/auth/me) and the account's own listings.
 */
export default function SupplierProfilePage() {
  return <ProfileView role="supplier" />;
}
