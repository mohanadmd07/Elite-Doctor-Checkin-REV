import { describe, it, expect, beforeEach } from 'vitest';
import {
  toWhatsAppPhone,
  parseDoctorCallMessage,
  formatDoctorCallAlert,
  isDuplicateMessage,
} from '../doctorCallDispatcher';

describe('Egyptian WhatsApp Phone Normalization', () => {
  it('adds country code 20 to 11-digit local mobile numbers starting with 0', () => {
    expect(toWhatsAppPhone('01012345678')).toBe('201012345678');
    expect(toWhatsAppPhone('01123456789')).toBe('201123456789');
    expect(toWhatsAppPhone('01234567890')).toBe('201234567890');
    expect(toWhatsAppPhone('01555555555')).toBe('201555555555');
  });

  it('keeps existing 20 prefix unchanged', () => {
    expect(toWhatsAppPhone('201012345678')).toBe('201012345678');
  });

  it('handles formatted numbers with dashes, spaces, and plus signs', () => {
    expect(toWhatsAppPhone('+20 10 1234 5678')).toBe('201012345678');
    expect(toWhatsAppPhone('010-1234-5678')).toBe('201012345678');
  });

  it('returns empty string for null, undefined, or empty inputs', () => {
    expect(toWhatsAppPhone('')).toBe('');
    expect(toWhatsAppPhone(undefined)).toBe('');
  });
});

describe('Doctor Call Message Parsing', () => {
  it('returns null if message does not contain DoctorCall trigger', () => {
    const text = 'Hello team, reminder for meeting at 3 PM';
    expect(parseDoctorCallMessage(text)).toBeNull();
  });

  it('parses valid multiline DoctorCall template', () => {
    const msg = [
      'Category: DoctorCall',
      'Group: Cardiology',
      'By: Nurse Sarah',
      'Room: 402',
      'Location: 4th Floor Ward',
      'Patient: Mohamed Ali',
      'Barcode: 987654321',
      'Admitting: Dr. Tarek',
      'Bed: B1',
    ].join('\n');

    const parsed = parseDoctorCallMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe('DoctorCall');
    expect(parsed?.departmentRaw).toBe('Cardiology');
    expect(parsed?.room).toBe('402');
    expect(parsed?.callerName).toBe('Nurse Sarah');
    expect(parsed?.patientName).toBe('Mohamed Ali');
    expect(parsed?.patientBarcode).toBe('987654321');
  });
});

describe('Doctor Call Alert Formatting', () => {
  it('formats single doctor alert message with mention tag', () => {
    const alert = formatDoctorCallAlert({
      doctors: [
        {
          id: '101',
          name: 'Ahmed Hassan',
          phone: '01012345678',
          waPhone: '201012345678',
          shifts: ['Morning shift'],
        },
      ],
      specialty: 'Cardiology',
      room: '402',
    });

    expect(alert).toContain('INPATIENT DOCTOR CALL');
    expect(alert).toContain('@201012345678');
    expect(alert).toContain('Ahmed Hassan');
    expect(alert).toContain('Room *402*');
    expect(alert).toContain('Cardiology');
  });

  it('formats multiple doctors on duty alert joined with ampersand', () => {
    const alert = formatDoctorCallAlert({
      doctors: [
        {
          id: '101',
          name: 'Dr. First',
          phone: '01011111111',
          waPhone: '201011111111',
          shifts: ['Morning shift'],
        },
        {
          id: '102',
          name: 'Dr. Second',
          phone: '01022222222',
          waPhone: '201022222222',
          shifts: ['Morning shift'],
        },
      ],
      specialty: 'General Surgery',
      room: 'ICU-3',
    });

    expect(alert).toContain('Dr. @201011111111 *Dr. First* & Dr. @201022222222 *Dr. Second*');
    expect(alert).toContain('Room *ICU-3*');
  });
});

describe('Deduplication Cache', () => {
  it('detects duplicate message IDs within TTL', () => {
    const id = 'msg_unique_12345';
    expect(isDuplicateMessage(id)).toBe(false);
    expect(isDuplicateMessage(id)).toBe(true);
  });
});
