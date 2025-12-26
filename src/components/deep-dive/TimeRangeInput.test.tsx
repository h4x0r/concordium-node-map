import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRangeInput } from './TimeRangeInput';

describe('TimeRangeInput', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const now = Date.now();

  const defaultProps = {
    onRangeChange: vi.fn(),
    now,
  };

  describe('rendering', () => {
    it('renders input field', () => {
      render(<TimeRangeInput {...defaultProps} />);
      expect(screen.getByTestId('time-range-input')).toBeInTheDocument();
    });

    it('renders placeholder text', () => {
      render(<TimeRangeInput {...defaultProps} />);
      const input = screen.getByTestId('time-range-input');
      expect(input).toHaveAttribute('placeholder', '2h, 30m, 3d...');
    });

    it('renders apply button', () => {
      render(<TimeRangeInput {...defaultProps} />);
      expect(screen.getByTestId('apply-button')).toBeInTheDocument();
    });
  });

  describe('valid input handling', () => {
    it('calls onRangeChange with parsed range on Enter', () => {
      const onRangeChange = vi.fn();
      render(<TimeRangeInput {...defaultProps} onRangeChange={onRangeChange} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.change(input, { target: { value: '2h' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRangeChange).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.any(Number),
          end: now,
        })
      );
    });

    it('calls onRangeChange with parsed range on button click', () => {
      const onRangeChange = vi.fn();
      render(<TimeRangeInput {...defaultProps} onRangeChange={onRangeChange} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.change(input, { target: { value: '3d' } });

      const button = screen.getByTestId('apply-button');
      fireEvent.click(button);

      expect(onRangeChange).toHaveBeenCalled();
    });

    it('clears input after successful apply', () => {
      const onRangeChange = vi.fn();
      render(<TimeRangeInput {...defaultProps} onRangeChange={onRangeChange} />);

      const input = screen.getByTestId('time-range-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '6h' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input.value).toBe('');
    });
  });

  describe('invalid input handling', () => {
    it('shows error state for invalid input', () => {
      render(<TimeRangeInput {...defaultProps} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByTestId('input-error')).toBeInTheDocument();
    });

    it('does not call onRangeChange for invalid input', () => {
      const onRangeChange = vi.fn();
      render(<TimeRangeInput {...defaultProps} onRangeChange={onRangeChange} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRangeChange).not.toHaveBeenCalled();
    });

    it('clears error on new input', () => {
      render(<TimeRangeInput {...defaultProps} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByTestId('input-error')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '2h' } });
      expect(screen.queryByTestId('input-error')).not.toBeInTheDocument();
    });
  });

  describe('examples tooltip', () => {
    it('shows examples on focus', () => {
      render(<TimeRangeInput {...defaultProps} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.focus(input);

      expect(screen.getByTestId('examples-tooltip')).toBeInTheDocument();
    });

    it('hides examples on blur', () => {
      render(<TimeRangeInput {...defaultProps} />);

      const input = screen.getByTestId('time-range-input');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(screen.queryByTestId('examples-tooltip')).not.toBeInTheDocument();
    });
  });
});
