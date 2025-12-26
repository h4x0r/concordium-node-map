'use client';

import { useState, useCallback } from 'react';
import { parseTimeInput, type TimeRange } from '@/lib/timeline';

export interface TimeRangeInputProps {
  onRangeChange: (range: TimeRange) => void;
  now: number;
}

const EXAMPLES = [
  '30m, 2h, 6h, 24h',
  '3d, 7d, 2w',
  'last 4 hours',
  '2024-12-25 to 2024-12-26',
];

export function TimeRangeInput({ onRangeChange, now }: TimeRangeInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const handleApply = useCallback(() => {
    if (!value.trim()) {
      return;
    }

    const result = parseTimeInput(value, now);

    if (result) {
      onRangeChange(result);
      setValue('');
      setError(false);
    } else {
      setError(true);
    }
  }, [value, now, onRangeChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleApply();
      }
    },
    [handleApply]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(false);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <input
        data-testid="time-range-input"
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowExamples(true)}
        onBlur={() => setShowExamples(false)}
        placeholder="2h, 30m, 3d..."
        style={{
          width: '120px',
          padding: '4px 8px',
          background: 'var(--bb-bg)',
          border: `1px solid ${error ? 'var(--bb-red)' : 'var(--bb-border)'}`,
          color: 'var(--bb-text)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          borderRadius: '2px',
          outline: 'none',
        }}
      />
      <button
        data-testid="apply-button"
        onClick={handleApply}
        style={{
          padding: '4px 8px',
          background: 'transparent',
          border: '1px solid var(--bb-border)',
          color: 'var(--bb-cyan)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          borderRadius: '2px',
        }}
      >
        Go
      </button>

      {error && (
        <span
          data-testid="input-error"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '2px',
            fontSize: '9px',
            color: 'var(--bb-red)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Invalid format
        </span>
      )}

      {showExamples && !error && (
        <div
          data-testid="examples-tooltip"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            padding: '8px',
            background: 'var(--bb-panel)',
            border: '1px solid var(--bb-border)',
            borderRadius: '4px',
            zIndex: 100,
            minWidth: '180px',
          }}
        >
          <div
            style={{
              fontSize: '9px',
              color: 'var(--bb-gray)',
              marginBottom: '4px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Examples:
          </div>
          {EXAMPLES.map((ex, i) => (
            <div
              key={i}
              style={{
                fontSize: '10px',
                color: 'var(--bb-text)',
                fontFamily: 'var(--font-mono)',
                marginBottom: '2px',
              }}
            >
              {ex}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
