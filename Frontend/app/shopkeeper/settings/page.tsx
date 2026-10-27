"use client";

import React from 'react';
import { SettingsView } from '@/components/SettingsView';

/**
 * Shopkeeper account settings.
 *
 * Previously the form was hardcoded to the demo account ("M. Hassan") and the
 * save handlers only cleared a local error string — nothing was ever loaded or
 * persisted. SettingsView now loads the real account and saves it through
 * PATCH /api/auth/me.
 */
export default function ShopkeeperSettingsPage() {
  return <SettingsView role="shopkeeper" />;
}
