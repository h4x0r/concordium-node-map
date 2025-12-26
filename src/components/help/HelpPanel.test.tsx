import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpPanel } from './HelpPanel';

describe('HelpPanel', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <HelpPanel isOpen={false} onClose={mockOnClose} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders panel when isOpen is true', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByTestId('help-panel')).toBeInTheDocument();
    });

    it('renders HELP title in header', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('HELP')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });
  });

  describe('sections', () => {
    it('renders KEYBOARD SHORTCUTS section', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('KEYBOARD SHORTCUTS')).toBeInTheDocument();
    });

    it('renders DASHBOARD AREAS section', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('DASHBOARD AREAS')).toBeInTheDocument();
    });

    it('renders METRICS GLOSSARY section', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('METRICS GLOSSARY')).toBeInTheDocument();
    });

    it('renders QUICK ACTIONS section', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('QUICK ACTIONS')).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts content', () => {
    it('shows ? shortcut for opening help', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('?')).toBeInTheDocument();
      expect(screen.getByText('Open help')).toBeInTheDocument();
    });

    it('shows ESC shortcut for closing', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('ESC')).toBeInTheDocument();
      expect(screen.getByText('Close panel/help')).toBeInTheDocument();
    });

    it('shows T shortcut for topology view', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('T')).toBeInTheDocument();
      expect(screen.getByText('Toggle Topology view')).toBeInTheDocument();
    });

    it('shows G shortcut for geographic view', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('G')).toBeInTheDocument();
      expect(screen.getByText('Toggle Geographic view')).toBeInTheDocument();
    });
  });

  describe('close behavior', () => {
    it('calls onClose when close button clicked', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop clicked', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      const backdrop = screen.getByTestId('help-backdrop');
      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when ESC key pressed', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('metrics glossary content', () => {
    it('explains PULSE metric', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText(/PULSE/)).toBeInTheDocument();
      expect(screen.getByText(/network health score/i)).toBeInTheDocument();
    });

    it('explains SYNC LAG metric', () => {
      render(<HelpPanel isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText(/SYNC LAG/)).toBeInTheDocument();
    });
  });
});
