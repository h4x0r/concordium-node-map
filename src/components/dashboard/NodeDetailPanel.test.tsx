import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { NodeDetailPanel } from './NodeDetailPanel';

describe('NodeDetailPanel', () => {
  const mockNodeData = {
    nodeId: 'node-123',
    nodeName: 'Concordium-Node-01',
    healthHistory: [
      { timestamp: 1000, status: 'healthy' as const },
      { timestamp: 2000, status: 'lagging' as const },
      { timestamp: 3000, status: 'healthy' as const },
    ],
    latencyHistory: [
      { timestamp: 1000, value: 50 },
      { timestamp: 2000, value: 75 },
      { timestamp: 3000, value: 60 },
    ],
    bandwidthInHistory: [
      { timestamp: 1000, value: 100 },
      { timestamp: 2000, value: 150 },
      { timestamp: 3000, value: 120 },
    ],
    bandwidthOutHistory: [
      { timestamp: 1000, value: 80 },
      { timestamp: 2000, value: 90 },
      { timestamp: 3000, value: 85 },
    ],
    peerCountHistory: [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 12 },
      { timestamp: 3000, value: 11 },
    ],
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders the node name in header', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(screen.getByText('Concordium-Node-01')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renders the health timeline', () => {
    const { container } = render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(container.querySelector('.health-timeline')).toBeInTheDocument();
  });

  it('renders latency chart', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(screen.getByText('Latency')).toBeInTheDocument();
  });

  it('renders bandwidth chart', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(screen.getByText('Bandwidth')).toBeInTheDocument();
  });

  it('renders peer count chart', () => {
    render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(screen.getByText(/Peers/i)).toBeInTheDocument();
  });

  it('renders the panel container', () => {
    const { container } = render(<NodeDetailPanel {...mockNodeData} onClose={mockOnClose} />);
    expect(container.querySelector('.node-detail-panel')).toBeInTheDocument();
  });
});
