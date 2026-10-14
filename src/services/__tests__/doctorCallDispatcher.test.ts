import { describe, it, expect, beforeEach } from 'vitest';
import {
  toWhatsAppPhone,
  parseDoctorCallMessage,
  formatDoctorCallAlert,
  isDuplicateMessage,
  processDoctorCallWebhook,
  parseDoctorCallDate,
  previewCustomDoctorCall,
  sendCustomDoctorCall,
  resolveHospitalDutyDate,
  getHospitalDutyDate
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

  it('parses real hospital message 1 (General Surgery - Room 409)', () => {
    const msg = `Type: Request

Category: DoctorCall

Group: الجراحة العامة

By: Ahmed Fathy Salama Elsayed

Date: 14/10/2026 9:23:12 م

Location: Elite 4th Floor - Elite

Sub.Location: Room 409


Patient Barcode: 0000263656
Patient Name: مصطفي عبدالوهاب محمد خطابي
Admitting Phys: Akram   Assem
Bed: Bed 409`;

    const parsed = parseDoctorCallMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe('DoctorCall');
    expect(parsed?.departmentRaw).toBe('الجراحة العامة');
    expect(parsed?.canonicalDepartment).toBe('General Surgery');
    expect(parsed?.room).toBe('409');
    expect(parsed?.callerName).toBe('Ahmed Fathy Salama Elsayed');
    expect(parsed?.patientName).toBe('مصطفي عبدالوهاب محمد خطابي');
    expect(parsed?.patientBarcode).toBe('0000263656');
    expect(parsed?.admittingPhysician).toBe('Akram   Assem');
    expect(parsed?.bed).toBe('Bed 409');
  });

  it('parses real hospital message 2 (Obstetrics & Gynecology - Room 302 with notes)', () => {
    const msg = `Type: Request

Category: DoctorCall

Group:  النساء وتوليد

By: Hadeer Ahmed Arafa Shabaan

Date: 10/14/2026, 7:16:39 PM

Location: Elite 3rd Floor - Elite

Sub.Location: Room 302


Patient Barcode: 0000085801
Patient Name: حنان مصطفى احمد محمد
Admitting Phys: Mahmoud Elsayed Hanafy Mliss
Bed: Bed 302

المرور على الحالة`;

    const parsed = parseDoctorCallMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed?.category).toBe('DoctorCall');
    expect(parsed?.departmentRaw).toBe('النساء وتوليد');
    expect(parsed?.canonicalDepartment).toBe('Obstetrics and gynecology');
    expect(parsed?.room).toBe('302');
    expect(parsed?.callerName).toBe('Hadeer Ahmed Arafa Shabaan');
    expect(parsed?.patientName).toBe('حنان مصطفى احمد محمد');
    expect(parsed?.patientBarcode).toBe('0000085801');
    expect(parsed?.notes).toBe('المرور على الحالة');
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

describe('Flat Green-API Incoming Message Payload', () => {
  it('successfully extracts and parses flat Green-API message payload', async () => {
    const payload = {
      type: "incoming",
      idMessage: "3EB015F6FB16C1950B9F65_TEST",
      timestamp: 1792002276,
      typeMessage: "textMessage",
      chatId: "120363345000178212@g.us",
      textMessage: "Type: Request\n\nCategory: DoctorCall\n\nGroup: الجراحة العامة\n\nBy: Ahmed Fathy Salama Elsayed\n\nDate: 14/10/2026 9:23:12 م\n\nLocation: Elite 4th Floor - Elite\n\nSub.Location: Room 409\n\n\nPatient Barcode: 0000263656\nPatient Name: مصطفي عبدالوهاب محمد خطابي\nAdmitting Phys: Akram   Assem\nBed: Bed 409",
      senderId: "201103700026@c.us",
      senderName: "Elite Hospital",
      senderContactName: "Elite Hospital",
      deletedMessageId: "",
      editedMessageId: "",
      isEdited: false,
      isDeleted: false,
      isRead: false
    };

    const result = await processDoctorCallWebhook({
      rawBody: payload,
      getActiveCheckins: async () => [
        {
          doctorId: "101",
          doctorName: "Dr. Ahmed Mohamed",
          department: "General Surgery",
          shift: "Evening shift",
          phoneNumber: "01012345678"
        }
      ]
    });

    expect(result.handled).toBe(true);
    expect(result.callRecord?.room).toBe("409");
    expect(result.callRecord?.department).toBe("General Surgery");
    expect(result.callRecord?.patientName).toBe("مصطفي عبدالوهاب محمد خطابي");
    expect(result.callRecord?.callerName).toBe("Ahmed Fathy Salama Elsayed");
  });
});

describe('Doctor Call Date Parsing & Exact Day Date Roster Matching', () => {
  it('parses diverse Egyptian, Arabic, and US date formats into YYYY-MM-DD', () => {
    expect(parseDoctorCallDate('14‏/10‏/2026 9:23:12 م')).toBe('2026-10-14');
    expect(parseDoctorCallDate('10/14/2026, 7:16:39 PM')).toBe('2026-10-14');
    expect(parseDoctorCallDate('١٤/١٠/٢٠٢٦ ٩:٢٣:١٢ م')).toBe('2026-10-14');
    expect(parseDoctorCallDate('2026-10-14 21:23:12')).toBe('2026-10-14');
    expect(parseDoctorCallDate('2026/10/14')).toBe('2026-10-14');
    expect(parseDoctorCallDate('05/10/2026')).toBe('2026-10-05');
  });

  it('passes the exact day date from message to getActiveCheckins', async () => {
    let capturedDate = "";
    const rawMessage =
      "Type: Request\n\n" +
      "Category: DoctorCall\n\n" +
      "Group: الجراحة العامة\n\n" +
      "By: Nurse Fatima\n\n" +
      "Date: 14‏/10‏/2026 9:23:12 م\n\n" +
      "Location: Elite 4th Floor - Elite\n\n" +
      "Sub.Location: Room 409\n\n" +
      "Patient Barcode: 0000263656\n" +
      "Patient Name: مصطفي عبدالوهاب محمد خطابي\n" +
      "Admitting Phys: Akram Assem\n" +
      "Bed: Bed 409";

    const payload = {
      typeWebhook: "incomingMessageReceived",
      idMessage: "test_call_date_" + Date.now(),
      senderData: {
        chatId: "120363345000178212@g.us",
        senderName: "Elite Hospital"
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: {
          textMessage: rawMessage
        }
      }
    };

    const result = await processDoctorCallWebhook({
      rawBody: payload,
      getActiveCheckins: async (targetDate?: string) => {
        capturedDate = targetDate || "";
        return [
          {
            id: "101",
            doctorName: "Dr. Ahmed Mohamed",
            department: "General Surgery",
            shifts: ["Evening shift", "Night shift"],
            mobileNumber: "01012345678"
          }
        ];
      }
    });

    expect(capturedDate).toBe("2026-10-14");
    expect(result.handled).toBe(true);
    expect(result.callRecord?.callDate).toBe("2026-10-14");
    expect(result.callRecord?.dispatchedDoctors.length).toBeGreaterThan(0);
    expect(result.callRecord?.dispatchedDoctors[0].name).toBe("Dr. Ahmed Mohamed");
  });
});

describe('Custom Doctor Call Preview & Dispatch Workflow', () => {
  it('correctly matches doctors from monthly sheet, formats alert, and previews message', async () => {
    const mockCheckins = [
      {
        id: "101",
        doctorName: "Dr. Hassan Ahmed",
        doctorArabicName: "د. حسن احمد",
        department: "General Surgery",
        shifts: ["Evening shift", "Night shift"],
        mobileNumber: "01099887766"
      },
      {
        id: "102",
        doctorName: "Dr. Mona Aly",
        doctorArabicName: "د. منى علي",
        department: "Internal Medicine",
        shifts: ["Morning shift"],
        mobileNumber: "01122334455"
      }
    ];

    const preview = await previewCustomDoctorCall({
      payload: {
        room: "Room 409",
        department: "الجراحة العامة",
        date: "2026-10-14",
        patientName: "مصطفى عبد الوهاب",
        notes: "المرور العاجل على الحالة"
      },
      getActiveCheckins: async () => mockCheckins
    });

    expect(preview.success).toBe(true);
    expect(preview.canonicalDepartment).toBe("General Surgery");
    expect(preview.callDate).toBe("2026-10-14");
    expect(preview.matchingDoctors.length).toBe(1);
    expect(preview.matchingDoctors[0].name).toBe("Dr. Hassan Ahmed");
    expect(preview.matchingDoctors[0].waPhone).toBe("201099887766");
    expect(preview.formattedMessage).toContain("Room *Room 409*");
    expect(preview.formattedMessage).toContain("General Surgery");
    expect(preview.formattedMessage).toContain("المرور العاجل على الحالة");
    expect(preview.formattedMessage).toContain("@201099887766");
  });

  it('allows customizing message text in preview', async () => {
    const customText = "🚨 CUSTOM URGENT CALL: Doctor needed in Room 505 immediately!";
    const preview = await previewCustomDoctorCall({
      payload: {
        room: "Room 505",
        department: "ICU",
        customMessage: customText
      },
      getActiveCheckins: async () => []
    });

    expect(preview.formattedMessage).toBe(customText);
  });
});

describe('8:00 AM Egypt Hospital Duty Date Boundary Rule', () => {
  it('resolves calls before 8:00 AM Cairo time to previous day duty roster', () => {
    // 02:15:00 AM Cairo on Oct 15 -> duty date must be Oct 14
    expect(resolveHospitalDutyDate('15/10/2026 02:15:00 ص')).toBe('2026-10-14');
    expect(resolveHospitalDutyDate('10/15/2026, 2:15:00 AM')).toBe('2026-10-14');
    // 07:59:00 AM Cairo on Oct 15 -> duty date must be Oct 14
    expect(resolveHospitalDutyDate('15/10/2026 07:59:00 ص')).toBe('2026-10-14');
  });

  it('resolves calls at or after 8:00 AM Cairo time to current day duty roster', () => {
    // 08:00:00 AM Cairo on Oct 15 -> duty date must be Oct 15
    expect(resolveHospitalDutyDate('15/10/2026 08:00:00 ص')).toBe('2026-10-15');
    expect(resolveHospitalDutyDate('10/15/2026, 8:00:00 AM')).toBe('2026-10-15');
    // 09:30:00 PM Cairo on Oct 15 -> duty date must be Oct 15
    expect(resolveHospitalDutyDate('15/10/2026 09:30:00 م')).toBe('2026-10-15');
    expect(resolveHospitalDutyDate('10/15/2026, 9:30:00 PM')).toBe('2026-10-15');
  });

  it('getHospitalDutyDate calculates previous day when current Cairo time is before 8:00 AM', () => {
    // 04:00 AM Cairo is 01:00 UTC
    const earlyMorningUtc = new Date('2026-10-15T01:00:00Z');
    expect(getHospitalDutyDate(earlyMorningUtc)).toBe('2026-10-14');

    // 11:00 AM Cairo is 08:00 UTC
    const daytimeUtc = new Date('2026-10-15T08:00:00Z');
    expect(getHospitalDutyDate(daytimeUtc)).toBe('2026-10-15');
  });

  it('webhook correctly matches previous day doctors for calls arriving before 8:00 AM', async () => {
    let queriedDate = "";
    const callMessageAtNight =
      "Type: Request\n" +
      "Category: DoctorCall\n" +
      "Group: الجراحة العامة\n" +
      "By: Night Nurse\n" +
      "Date: 15/10/2026 03:45:00 ص\n" +
      "Location: Elite 4th Floor\n" +
      "Sub.Location: Room 409\n" +
      "Patient Name: احمد سعيد\n" +
      "Bed: Bed 409";

    const payload = {
      typeWebhook: "incomingMessageReceived",
      idMessage: "msg_night_call_" + Date.now(),
      senderData: {
        chatId: "120363345000178212@g.us",
        senderName: "Elite Hospital"
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: {
          textMessage: callMessageAtNight
        }
      }
    };

    const result = await processDoctorCallWebhook({
      rawBody: payload,
      getActiveCheckins: async (dutyDate?: string) => {
        queriedDate = dutyDate || "";
        return [
          {
            id: "201",
            doctorName: "Dr. On-Duty Night Surgeon",
            department: "General Surgery",
            shifts: ["Night shift", "24 shift"],
            mobileNumber: "01000000001"
          }
        ];
      }
    });

    expect(queriedDate).toBe("2026-10-14");
    expect(result.handled).toBe(true);
    expect(result.callRecord?.callDate).toBe("2026-10-14");
    expect(result.callRecord?.dispatchedDoctors[0].name).toBe("Dr. On-Duty Night Surgeon");
  });
});

describe('WhatsApp Formatting & Flexible Doctor Call Trigger Ingestion', () => {
  it('parses messages with WhatsApp bold asterisks and markdown formatting', () => {
    const formattedMsg =
      "*Type:* *Request*\n\n" +
      "*Category:* *DoctorCall*\n\n" +
      "*Group:* *الجراحة العامة*\n\n" +
      "*By:* Ahmed Fathy\n\n" +
      "*Date:* 14‏/10‏/2026 9:23:12 م\n\n" +
      "*Location:* Elite 4th Floor\n\n" +
      "*Sub.Location:* *Room 409*\n\n" +
      "*Patient Barcode:* *0000263656*\n" +
      "*Patient Name:* *مصطفي عبدالوهاب*\n" +
      "*Admitting Phys:* Akram Assem\n" +
      "*Bed:* *Bed 409*";

    const parsed = parseDoctorCallMessage(formattedMsg);
    expect(parsed).not.toBeNull();
    expect(parsed?.canonicalDepartment).toBe("General Surgery");
    expect(parsed?.room).toBe("409");
    expect(parsed?.patientName).toBe("مصطفي عبدالوهاب");
    expect(parsed?.patientBarcode).toBe("0000263656");
  });

  it('parses structured nurse requests even when Category: DoctorCall header is omitted', () => {
    const msgWithoutCategory =
      "Type: Request\n\n" +
      "Group:  النساء وتوليد\n\n" +
      "By: Hadeer Ahmed\n\n" +
      "Date: 10/14/2026, 7:16:39 PM\n\n" +
      "Location: Elite 3rd Floor - Elite\n\n" +
      "Sub.Location: Room 302\n\n" +
      "Patient Barcode: 0000085801\n" +
      "Patient Name: حنان مصطفى\n" +
      "Admitting Phys: Mahmoud Elsayed\n" +
      "Bed: Bed 302\n\n" +
      "المرور على الحالة";

    const parsed = parseDoctorCallMessage(msgWithoutCategory);
    expect(parsed).not.toBeNull();
    expect(parsed?.canonicalDepartment).toBe("Obstetrics and gynecology");
    expect(parsed?.room).toBe("302");
    expect(parsed?.patientName).toBe("حنان مصطفى");
    expect(parsed?.notes).toBe("المرور على الحالة");
  });
});



