import React from 'react';
import { formatStatusLabel, getStatusClass } from './StatusHelpers';

interface StatusBadgeProps {
  status: string;
  className?: string;
  showRawTooltip?: boolean;
}

export default function StatusBadge({ status, className = '', showRawTooltip = true }: StatusBadgeProps) {
  const label = formatStatusLabel(status);
  const statusClass = getStatusClass(status);

  return (
    <span
      className={`badge ${statusClass} ${className}`}
      title={showRawTooltip ? `Domain status: ${status}` : undefined}
    >
      {label}
    </span>
  );
}
