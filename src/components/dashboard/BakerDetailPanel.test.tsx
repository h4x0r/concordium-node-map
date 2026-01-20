/**
 * Tests for BakerDetailPanel component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BakerDetailPanel } from './BakerDetailPanel';
import type { Validator } from '@/lib/types/validators';

const mockValidator: Validator = {
  bakerId: 42,
  accountAddress: '3abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
  source: 'reporting',
  linkedPeerId: 'peer-123',
  equityCapital: '1000000000000',
  delegatedCapital: '500000000000',
  totalStake: '1500000000000',
  lotteryPower: 0.05,
  openStatus: 'Open',
  commissionRates: {
    baking: 0.1,
    finalization: 0.05,
    transaction: 0.01,
  },
  inCurrentPayday: true,
  effectiveStake: '1400000000000',
  lastBlockHeight: 12345678,
  lastBlockTime: Date.now() - 30 * 60 * 1000, // 30 min ago
  blocks24h: 42,
  blocks7d: 280,
  blocks30d: 1200,
  transactions24h: 150,
  transactions7d: 1050,
  transactions30d: 4500,
  firstObserved: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
  lastChainUpdate: Date.now() - 5 * 60 * 1000, // 5 min ago
  stateTransitionCount: 3,
  dataCompleteness: 0.95,
};

describe('BakerDetailPanel', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <BakerDetailPanel isOpen={false} validator={mockValidator} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders panel when open', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('Baker Details')).toBeInTheDocument();
  });

  it('displays baker ID in header', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText(/Baker #42/)).toBeInTheDocument();
  });

  it('calls onClose when clicking close button', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking overlay', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    const overlay = document.querySelector('.bdp-overlay');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking panel content', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    const panel = document.querySelector('.bdp-panel');
    expect(panel).toBeInTheDocument();
    fireEvent.click(panel!);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('displays account address with truncation', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    // Should show truncated address
    expect(screen.getByText(/3abc123d.*yz/)).toBeInTheDocument();
  });

  it('shows Visible badge for reporting validators', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('shows Phantom badge for chain_only validators', () => {
    const phantomValidator = { ...mockValidator, source: 'chain_only' as const };
    render(<BakerDetailPanel isOpen={true} validator={phantomValidator} onClose={mockOnClose} />);
    expect(screen.getByText('Phantom')).toBeInTheDocument();
  });

  it('displays block production stats', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('42')).toBeInTheDocument(); // blocks24h
    expect(screen.getByText('280')).toBeInTheDocument(); // blocks7d
    expect(screen.getByText('1,200')).toBeInTheDocument(); // blocks30d (with locale formatting)
  });

  it('displays transaction stats', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('150')).toBeInTheDocument(); // transactions24h
    expect(screen.getByText('1,050')).toBeInTheDocument(); // transactions7d (with locale formatting)
    expect(screen.getByText('4,500')).toBeInTheDocument(); // transactions30d (with locale formatting)
  });

  it('displays lottery power as percentage', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    // 0.05 * 100 = 5%
    expect(screen.getByText('5.000%')).toBeInTheDocument();
  });

  it('displays commission rates', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    // 0.1 * 100 = 10%, 0.05 * 100 = 5%, 0.01 * 100 = 1%
    expect(screen.getByText('10.00%')).toBeInTheDocument(); // baking commission
    expect(screen.getByText('5.00%')).toBeInTheDocument(); // finalization commission
    expect(screen.getByText('1.00%')).toBeInTheDocument(); // transaction commission
  });

  it('shows -- for null lottery power', () => {
    const noLotteryValidator = { ...mockValidator, lotteryPower: null };
    render(<BakerDetailPanel isOpen={true} validator={noLotteryValidator} onClose={mockOnClose} />);
    const dashValues = screen.getAllByText('--');
    expect(dashValues.length).toBeGreaterThan(0);
  });

  it('displays last block time formatted', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    // 30 min ago should show "Just now"
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('displays last block height', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('12,345,678')).toBeInTheDocument();
  });

  it('shows in payday badge when applicable', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('In Payday')).toBeInTheDocument();
  });

  it('displays open status', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('displays data completeness', () => {
    render(<BakerDetailPanel isOpen={true} validator={mockValidator} onClose={mockOnClose} />);
    // 0.95 * 100 = 95%
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('handles null validator gracefully', () => {
    render(<BakerDetailPanel isOpen={true} validator={null} onClose={mockOnClose} />);
    expect(screen.getByText('No validator selected')).toBeInTheDocument();
  });
});
