import React from 'react';
import { formatStatusLabel, getStatusClass } from './StatusHelpers';

interface StatusBadgeProps {
  status: string;
  label?: string;
  tone?: 'ready' | 'draft' | 'review' | 'blocked' | 'override';
  className?: string;
  showRawTooltip?: boolean;
}

export default function StatusBadge({
  status,
  label: customLabel,
  tone,
  className = '',
  showRawTooltip = true
}: StatusBadgeProps) {
  const label = customLabel ?? formatStatusLabel(status);
  const statusClass = tone ? `status-${tone}` : getStatusClass(status);

  return (
    <span
      className={`badge ${statusClass} ${className}`}
      title={showRawTooltip ? `Domain status: ${status}` : undefined}
    >
      {label}
    </span>
  );
}
