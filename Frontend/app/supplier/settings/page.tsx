"use client";

import React from 'react';
import { SettingsView } from '@/components/SettingsView';

/**
 * Supplier account settings.
 *
 * Previously the enterprise form was hardcoded to the demo supplier and the
 * save handler dropped the edits. SettingsView now loads the real account and
 * persists changes (PATCH /api/auth/me) and password updates
 * (PATCH /api/auth/me/password).
 */
export default function SupplierSettingsPage() {
  return <SettingsView role="supplier" />;
}
