import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineRuler } from './TimelineRuler';
import type { TimeRange } from '@/lib/timeline';

describe('TimelineRuler', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const now = Date.now();

  const defaultProps = {
    range: { start: now - DAY, end: now } as TimeRange,
    onZoom: vi.fn(),
    onPan: vi.fn(),
  };

  it('renders time labels', () => {
    render(<TimelineRuler {...defaultProps} />);

    const ruler = screen.getByTestId('timeline-ruler');
    expect(ruler).toBeInTheDocument();
  });

  it('shows formatted time labels for visible range', () => {
    const range: TimeRange = {
      start: new Date('2024-01-15T10:00:00Z').getTime(),
      end: new Date('2024-01-15T14:00:00Z').getTime(),
    };
    render(<TimelineRuler {...defaultProps} range={range} />);

    // Should show hour labels for short ranges
    const ruler = screen.getByTestId('timeline-ruler');
    expect(ruler.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('shows date labels for longer ranges', () => {
    const range: TimeRange = {
      start: new Date('2024-01-01').getTime(),
      end: new Date('2024-01-15').getTime(),
    };
    render(<TimelineRuler {...defaultProps} range={range} />);

    // Should show date labels for multi-day ranges
    const ruler = screen.getByTestId('timeline-ruler');
    expect(ruler.textContent).toMatch(/Jan/);
  });

  describe('zoom interaction', () => {
    it('calls onZoom when mouse wheel scrolls', () => {
      const onZoom = vi.fn();
      render(<TimelineRuler {...defaultProps} onZoom={onZoom} />);

      const ruler = screen.getByTestId('timeline-ruler');
      fireEvent.wheel(ruler, { deltaY: -100 }); // scroll up = zoom in

      expect(onZoom).toHaveBeenCalled();
    });

    it('zooms in on scroll up', () => {
      const onZoom = vi.fn();
      render(<TimelineRuler {...defaultProps} onZoom={onZoom} />);

      const ruler = screen.getByTestId('timeline-ruler');
      fireEvent.wheel(ruler, { deltaY: -100 });

      expect(onZoom).toHaveBeenCalledWith(
        expect.any(Number), // cursor ratio
        'in'
      );
    });

    it('zooms out on scroll down', () => {
      const onZoom = vi.fn();
      render(<TimelineRuler {...defaultProps} onZoom={onZoom} />);

      const ruler = screen.getByTestId('timeline-ruler');
      fireEvent.wheel(ruler, { deltaY: 100 });

      expect(onZoom).toHaveBeenCalledWith(
        expect.any(Number),
        'out'
      );
    });
  });

  describe('pan interaction', () => {
    it('calls onPan during drag', () => {
      const onPan = vi.fn();
      render(<TimelineRuler {...defaultProps} onPan={onPan} />);

      const ruler = screen.getByTestId('timeline-ruler');

      fireEvent.mouseDown(ruler, { clientX: 100 });
      fireEvent.mouseMove(ruler, { clientX: 150 });
      fireEvent.mouseUp(ruler);

      expect(onPan).toHaveBeenCalled();
    });
  });

  describe('cursor indicator', () => {
    it('shows cursor position on hover', () => {
      render(<TimelineRuler {...defaultProps} />);

      const ruler = screen.getByTestId('timeline-ruler');
      fireEvent.mouseMove(ruler, { clientX: 200 });

      // Should show cursor line
      expect(screen.getByTestId('cursor-line')).toBeInTheDocument();
    });

    it('hides cursor on mouse leave', () => {
      render(<TimelineRuler {...defaultProps} />);

      const ruler = screen.getByTestId('timeline-ruler');
      fireEvent.mouseMove(ruler, { clientX: 200 });
      fireEvent.mouseLeave(ruler);

      expect(screen.queryByTestId('cursor-line')).not.toBeInTheDocument();
    });
  });

  describe('minimap', () => {
    it('renders minimap when bounds and onSetRange provided', () => {
      const bounds: TimeRange = { start: now - 30 * DAY, end: now };
      render(<TimelineRuler {...defaultProps} bounds={bounds} onSetRange={vi.fn()} />);

      expect(screen.getByTestId('timeline-minimap')).toBeInTheDocument();
    });

    it('shows visible window in minimap', () => {
      const bounds: TimeRange = { start: now - 30 * DAY, end: now };
      const range: TimeRange = { start: now - DAY, end: now };
      render(<TimelineRuler {...defaultProps} range={range} bounds={bounds} onSetRange={vi.fn()} />);

      const window = screen.getByTestId('minimap-window');
      expect(window).toBeInTheDocument();
    });
  });

  describe('minimap edge drag handles', () => {
    const bounds: TimeRange = { start: now - 30 * DAY, end: now };
    const propsWithBounds = {
      ...defaultProps,
      bounds,
      onSetRange: vi.fn(),
    };

    it('renders left edge handle in minimap', () => {
      render(<TimelineRuler {...propsWithBounds} />);
      expect(screen.getByTestId('edge-handle-left')).toBeInTheDocument();
    });

    it('renders right edge handle in minimap', () => {
      render(<TimelineRuler {...propsWithBounds} />);
      expect(screen.getByTestId('edge-handle-right')).toBeInTheDocument();
    });

    it('calls onSetRange when left edge is dragged', () => {
      const onSetRange = vi.fn();
      render(<TimelineRuler {...defaultProps} bounds={bounds} onSetRange={onSetRange} />);

      const leftHandle = screen.getByTestId('edge-handle-left');
      const minimap = screen.getByTestId('timeline-minimap');

      // Simulate drag: mouseDown on handle, mouseMove on minimap
      fireEvent.mouseDown(leftHandle, { clientX: 100 });
      fireEvent.mouseMove(minimap, { clientX: 150 });
      fireEvent.mouseUp(minimap);

      expect(onSetRange).toHaveBeenCalled();
    });

    it('calls onSetRange when right edge is dragged', () => {
      const onSetRange = vi.fn();
      render(<TimelineRuler {...defaultProps} bounds={bounds} onSetRange={onSetRange} />);

      const rightHandle = screen.getByTestId('edge-handle-right');
      const minimap = screen.getByTestId('timeline-minimap');

      // Simulate drag: mouseDown on handle, mouseMove on minimap
      fireEvent.mouseDown(rightHandle, { clientX: 700 });
      fireEvent.mouseMove(minimap, { clientX: 750 });
      fireEvent.mouseUp(minimap);

      expect(onSetRange).toHaveBeenCalled();
    });

    it('calls onSetRange when minimap window is dragged (pan)', () => {
      const onSetRange = vi.fn();
      render(<TimelineRuler {...defaultProps} bounds={bounds} onSetRange={onSetRange} />);

      const window = screen.getByTestId('minimap-window');
      const minimap = screen.getByTestId('timeline-minimap');

      // Simulate drag: mouseDown on window, mouseMove on minimap
      fireEvent.mouseDown(window, { clientX: 400 });
      fireEvent.mouseMove(minimap, { clientX: 500 });
      fireEvent.mouseUp(minimap);

      expect(onSetRange).toHaveBeenCalled();
    });

    it('does not call onPan when dragging minimap', () => {
      const onPan = vi.fn();
      const onSetRange = vi.fn();
      render(<TimelineRuler {...defaultProps} bounds={bounds} onPan={onPan} onSetRange={onSetRange} />);

      const leftHandle = screen.getByTestId('edge-handle-left');
      const minimap = screen.getByTestId('timeline-minimap');

      fireEvent.mouseDown(leftHandle, { clientX: 100 });
      fireEvent.mouseMove(minimap, { clientX: 150 });
      fireEvent.mouseUp(minimap);

      // Pan should not be called when dragging minimap
      expect(onPan).not.toHaveBeenCalled();
    });
  });
});
