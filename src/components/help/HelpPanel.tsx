'use client';

import { useEffect } from 'react';

export interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  action: string;
}

const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  { key: '?', action: 'Open help' },
  { key: 'ESC', action: 'Close panel/help' },
  { key: 'T', action: 'Toggle Topology view' },
  { key: 'G', action: 'Toggle Geographic view' },
  { key: '/', action: 'Focus search' },
  { key: '↑/↓', action: 'Navigate node list' },
  { key: 'Enter', action: 'Select node' },
  { key: 'D', action: 'Open Deep Dive' },
];

interface GlossaryItem {
  term: string;
  definition: string;
}

const METRICS_GLOSSARY: GlossaryItem[] = [
  { term: 'PULSE', definition: 'Overall network health score (0-100%)' },
  { term: 'SYNC LAG', definition: 'Blocks behind finalization' },
  { term: 'FINALIZATION', definition: 'Block confirmation by validators' },
  { term: 'LATENCY', definition: 'Response time in milliseconds' },
  { term: 'PEERS', definition: 'Connected node count' },
];

interface DashboardArea {
  name: string;
  description: string;
}

const DASHBOARD_AREAS: DashboardArea[] = [
  { name: 'Command Bar', description: 'Search nodes, access help, view time' },
  { name: 'Ticker', description: 'Live network metrics, pulse status' },
  { name: 'Topology View', description: 'Force-directed graph of node connections' },
  { name: 'Geographic View', description: 'World map with node locations' },
  { name: 'Node Panel', description: 'Detail view when node selected' },
  { name: 'Deep Dive', description: 'Extended historical analysis' },
];

interface QuickAction {
  action: string;
  result: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { action: 'Click node', result: 'View details' },
  { action: 'Click "Deep Dive"', result: 'Historical analysis' },
  { action: 'Click "Compare"', result: 'Side-by-side node comparison' },
  { action: 'Drag topology', result: 'Reposition nodes' },
];

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="help-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 90,
        }}
      />

      {/* Panel */}
      <div
        data-testid="help-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          background: 'var(--bb-black, #0a0a0f)',
          borderLeft: '1px solid var(--bb-border)',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideInRight 200ms ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--bb-panel)',
            borderBottom: '1px solid var(--bb-border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 'bold',
              color: 'var(--bb-amber)',
            }}
          >
            HELP
          </span>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--bb-gray)',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0',
          }}
        >
          {/* Keyboard Shortcuts Section */}
          <HelpSection title="KEYBOARD SHORTCUTS">
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            >
              <tbody>
                {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        padding: '4px 8px',
                        color: 'var(--bb-cyan)',
                        width: '80px',
                      }}
                    >
                      {shortcut.key}
                    </td>
                    <td
                      style={{
                        padding: '4px 8px',
                        color: 'var(--bb-gray)',
                      }}
                    >
                      {shortcut.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HelpSection>

          {/* Dashboard Areas Section */}
          <HelpSection title="DASHBOARD AREAS">
            <div style={{ padding: '0 8px' }}>
              {DASHBOARD_AREAS.map((area, i) => (
                <div key={i} style={{ marginBottom: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--bb-orange)',
                      fontWeight: 'bold',
                    }}
                  >
                    {area.name}
                  </span>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--bb-gray)',
                      margin: '2px 0 0 0',
                    }}
                  >
                    {area.description}
                  </p>
                </div>
              ))}
            </div>
          </HelpSection>

          {/* Metrics Glossary Section */}
          <HelpSection title="METRICS GLOSSARY">
            <div style={{ padding: '0 8px' }}>
              {METRICS_GLOSSARY.map((item, i) => (
                <div key={i} style={{ marginBottom: '6px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--bb-green)',
                      fontWeight: 'bold',
                    }}
                  >
                    {item.term}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--bb-gray)',
                      marginLeft: '8px',
                    }}
                  >
                    {item.definition}
                  </span>
                </div>
              ))}
            </div>
          </HelpSection>

          {/* Quick Actions Section */}
          <HelpSection title="QUICK ACTIONS">
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            >
              <tbody>
                {QUICK_ACTIONS.map((action, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        padding: '4px 8px',
                        color: 'var(--bb-cyan)',
                        width: '120px',
                      }}
                    >
                      {action.action}
                    </td>
                    <td
                      style={{
                        padding: '4px 8px',
                        color: 'var(--bb-gray)',
                      }}
                    >
                      → {action.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HelpSection>

          {/* Contact Section */}
          <HelpSection title="CONTACT">
            <div style={{ padding: '0 8px' }}>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--bb-gray)',
                  margin: '0 0 8px 0',
                  lineHeight: '1.4',
                }}
              >
                Security reports, feature requests, bug reports, or questions:
              </p>
              <a
                href="mailto:org-security@concordium.com"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--bb-cyan)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  background: 'rgba(0, 255, 255, 0.05)',
                  border: '1px solid rgba(0, 255, 255, 0.2)',
                  borderRadius: '2px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.2)';
                }}
              >
                <span style={{ fontSize: '12px' }}>&#9993;</span>
                org-security@concordium.com
              </a>
            </div>
          </HelpSection>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--bb-border)',
            background: 'var(--bb-panel)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--bb-gray)',
              opacity: 0.7,
            }}
          >
            Press ESC or click outside to close
          </span>
          <a
            href="mailto:org-security@concordium.com"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--bb-gray)',
              textDecoration: 'none',
              opacity: 0.7,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.color = 'var(--bb-cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7';
              e.currentTarget.style.color = 'var(--bb-gray)';
            }}
          >
            Feedback?
          </a>
        </div>
      </div>
    </>
  );
}

interface HelpSectionProps {
  title: string;
  children: React.ReactNode;
}

function HelpSection({ title, children }: HelpSectionProps) {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--bb-border)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--bb-panel)',
          borderBottom: '1px solid var(--bb-border)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 'bold',
            color: 'var(--bb-amber)',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: '8px 4px' }}>{children}</div>
    </div>
  );
}
