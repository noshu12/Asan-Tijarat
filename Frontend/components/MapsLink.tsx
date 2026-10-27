"use client";

import React from 'react';
import { MapPin } from 'lucide-react';
import { googleMapsUrl } from '@/lib/utils';
import { User } from '@/lib/types';

/**
 * Clickable "Open in Google Maps" link used in the Admin Dashboard user
 * profile rows (pending-KYC cards + the KYC directory) and on the trader's
 * own profile page. Points at the captured GPS coordinates when they exist,
 * otherwise at a Google Maps search for the written location. Renders "—"
 * when neither piece of information is available.
 */
export function MapsLink({ user }: { user: Pick<User, 'currentLocation' | 'currentHouseLocation'> }) {
  const url = googleMapsUrl(user);

  if (!url) {
    return <span className="text-xs font-semibold text-slate-400">—</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={
        user.currentLocation
          ? `Captured GPS: ${user.currentLocation.lat}, ${user.currentLocation.lng}`
          : user.currentHouseLocation
      }
      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
    >
      <MapPin className="w-3.5 h-3.5 shrink-0" />
      <span>Open in Google Maps</span>
    </a>
  );
}
