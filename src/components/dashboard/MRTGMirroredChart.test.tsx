import { render, screen } from '@testing-library/react';
import { MRTGMirroredChart } from './MRTGMirroredChart';

describe('MRTGMirroredChart', () => {
  const mockData = {
    outbound: [
      { timestamp: 1000, value: 50 },
      { timestamp: 2000, value: 75 },
      { timestamp: 3000, value: 60 },
    ],
    inbound: [
      { timestamp: 1000, value: 40 },
      { timestamp: 2000, value: 80 },
      { timestamp: 3000, value: 55 },
    ],
  };

  it('renders with label', () => {
    render(
      <MRTGMirroredChart
        outboundData={mockData.outbound}
        inboundData={mockData.inbound}
        label="Bandwidth"
      />
    );
    expect(screen.getByText('Bandwidth')).toBeInTheDocument();
  });

  it('renders SVG with mirrored chart structure', () => {
    const { container } = render(
      <MRTGMirroredChart
        outboundData={mockData.outbound}
        inboundData={mockData.inbound}
        label="Bandwidth"
      />
    );

    // Should have an SVG element
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Should have paths for both outbound and inbound
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it('displays current values for both directions', () => {
    render(
      <MRTGMirroredChart
        outboundData={mockData.outbound}
        inboundData={mockData.inbound}
        label="Bandwidth"
        unit="KB/s"
      />
    );

    // Should show the latest outbound value (60)
    expect(screen.getByText(/60/)).toBeInTheDocument();
    // Should show the latest inbound value (55)
    expect(screen.getByText(/55/)).toBeInTheDocument();
  });

  it('renders direction indicators', () => {
    render(
      <MRTGMirroredChart
        outboundData={mockData.outbound}
        inboundData={mockData.inbound}
        label="Bandwidth"
      />
    );

    // Should have OUT and IN labels
    expect(screen.getByText(/OUT/i)).toBeInTheDocument();
    expect(screen.getByText(/IN/i)).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    const { container } = render(
      <MRTGMirroredChart
        outboundData={[]}
        inboundData={[]}
        label="Bandwidth"
      />
    );

    // Should still render without crashing
    expect(container.querySelector('.bb-mrtg-mirrored')).toBeInTheDocument();
  });
});
