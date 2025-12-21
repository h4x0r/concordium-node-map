'use client';

import { useState } from 'react';

interface CopyableValueProps {
  value: string;
  displayValue: string;
  className?: string;
}

export function CopyableTooltip({ value, displayValue, className = '' }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span className={className} title={value}>
        {displayValue}
      </span>
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy full value'}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          cursor: 'pointer',
          color: copied ? 'var(--bb-green)' : 'var(--bb-gray)',
          fontSize: '10px',
          lineHeight: 1,
          transition: 'color 0.2s',
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}
