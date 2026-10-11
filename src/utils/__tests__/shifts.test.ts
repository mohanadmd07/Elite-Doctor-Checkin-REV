import { describe, it, expect } from 'vitest';
import {
  formatShiftsForDisplay,
  normalizeArabic,
  compareDoctorIds,
  SHIFT_MAP_AR,
} from '../shifts';

describe('Shift Utilities', () => {
  it('consolidates 3 consecutive shifts (Morning, Evening, Night) into "24"', () => {
    const shifts = ['Morning shift', 'Evening shift', 'Night shift'];
    expect(formatShiftsForDisplay(shifts)).toBe('24');
  });

  it('maps single shifts correctly to Arabic', () => {
    expect(formatShiftsForDisplay(['Morning shift'])).toBe('مورنينج');
    expect(formatShiftsForDisplay(['Evening shift'])).toBe('ايڤينينج');
    expect(formatShiftsForDisplay(['Night shift'])).toBe('نايت');
    expect(formatShiftsForDisplay(['Long shift'])).toBe('لونج');
    expect(formatShiftsForDisplay(['24 shift'])).toBe('24');
  });

  it('handles empty or missing shifts gracefully', () => {
    expect(formatShiftsForDisplay([])).toBe('');
    expect(formatShiftsForDisplay(null as any)).toBe('');
    expect(formatShiftsForDisplay(undefined as any)).toBe('');
  });

  it('formats two shifts joined by comma', () => {
    const shifts = ['Morning shift', 'Evening shift'];
    expect(formatShiftsForDisplay(shifts)).toBe('مورنينج, ايڤينينج');
  });
});

describe('Arabic Text Normalization', () => {
  it('normalizes alef variants and hamzas', () => {
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('إبراهيم')).toBe('ابراهيم');
    expect(normalizeArabic('آمال')).toBe('امال');
  });

  it('normalizes teh marbuta and alef maksura', () => {
    expect(normalizeArabic('فاطمة')).toBe('فاطمه');
    expect(normalizeArabic('منى')).toBe('مني');
  });

  it('strips tashkeel / diacritics', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
  });

  it('collapses multiple whitespace characters', () => {
    expect(normalizeArabic('  د.   احمد   محمود  ')).toBe('د. احمد محمود');
  });
});

describe('Doctor ID Natural Comparison', () => {
  it('sorts numeric IDs numerically rather than lexicographically', () => {
    expect(compareDoctorIds('2', '10')).toBeLessThan(0);
    expect(compareDoctorIds('10', '2')).toBeGreaterThan(0);
    expect(compareDoctorIds('100', '20')).toBeGreaterThan(0);
  });

  it('strips emp prefix before comparing', () => {
    expect(compareDoctorIds('emp.5', 'emp.12')).toBeLessThan(0);
    expect(compareDoctorIds('emp10', 'emp2')).toBeGreaterThan(0);
  });

  it('orders numeric IDs before non-numeric IDs', () => {
    expect(compareDoctorIds('50', 'ABC')).toBeLessThan(0);
    expect(compareDoctorIds('XYZ', '50')).toBeGreaterThan(0);
  });
});
