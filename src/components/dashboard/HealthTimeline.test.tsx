import { render, screen } from '@testing-library/react';
import { HealthTimeline, type HealthStatus } from './HealthTimeline';

describe('HealthTimeline', () => {
  const mockData: HealthStatus[] = [
    { timestamp: 1000, status: 'healthy' },
    { timestamp: 2000, status: 'healthy' },
    { timestamp: 3000, status: 'lagging' },
    { timestamp: 4000, status: 'healthy' },
    { timestamp: 5000, status: 'issue' },
  ];

  it('renders the timeline container', () => {
    const { container } = render(<HealthTimeline data={mockData} />);
    expect(container.querySelector('.health-timeline')).toBeInTheDocument();
  });

  it('renders correct number of segments', () => {
    const { container } = render(<HealthTimeline data={mockData} />);
    const segments = container.querySelectorAll('.health-segment');
    expect(segments.length).toBe(5);
  });

  it('applies correct color classes based on status', () => {
    const { container } = render(<HealthTimeline data={mockData} />);
    const segments = container.querySelectorAll('.health-segment');

    // First two should be healthy (green)
    expect(segments[0]).toHaveClass('healthy');
    expect(segments[1]).toHaveClass('healthy');
    // Third should be lagging (amber)
    expect(segments[2]).toHaveClass('lagging');
    // Fourth should be healthy
    expect(segments[3]).toHaveClass('healthy');
    // Fifth should be issue (red)
    expect(segments[4]).toHaveClass('issue');
  });

  it('handles empty data gracefully', () => {
    const { container } = render(<HealthTimeline data={[]} />);
    expect(container.querySelector('.health-timeline')).toBeInTheDocument();
    expect(container.querySelectorAll('.health-segment').length).toBe(0);
  });

  it('shows time labels when showLabels is true', () => {
    render(<HealthTimeline data={mockData} showLabels />);
    // Should have start and end time indicators
    expect(screen.getByText(/-15m/i)).toBeInTheDocument();
    expect(screen.getByText(/now/i)).toBeInTheDocument();
  });
});
