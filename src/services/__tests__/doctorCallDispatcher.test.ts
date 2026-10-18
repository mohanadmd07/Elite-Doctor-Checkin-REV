import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  toWhatsAppPhone,
  parseDoctorCallMessage,
  formatDoctorCallAlert,
  isDuplicateMessage,
  processDoctorCallWebhook,
  pollGreenApiNotifications,
  parseDoctorCallDate,
  previewCustomDoctorCall,
  sendCustomDoctorCall,
  resolveHospitalDutyDate,
  getHospitalDutyDate,
  getCairoActiveShifts,
  matchesActiveShift,
  resolveHospitalCallDate
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

    // 01:16 AM Cairo on Oct 17 is 22:16 UTC on Oct 16 -> duty date must be Oct 16
    const oct17AfterMidnightUtc = new Date('2026-10-16T22:16:00Z');
    expect(getHospitalDutyDate(oct17AfterMidnightUtc)).toBe('2026-10-16');

    // Date-only string "2026-10-17" passed after midnight (01:16 AM Cairo on Oct 17) -> must resolve to "2026-10-16"
    expect(resolveHospitalDutyDate('2026-10-17', oct17AfterMidnightUtc)).toBe('2026-10-16');
    expect(resolveHospitalDutyDate('17/10/2026', oct17AfterMidnightUtc)).toBe('2026-10-16');
    expect(resolveHospitalDutyDate('10/17/2026, 1:16:00 AM', oct17AfterMidnightUtc)).toBe('2026-10-16');
    expect(resolveHospitalDutyDate('17/10/2026 12:30:00 صباحاً', oct17AfterMidnightUtc)).toBe('2026-10-16');

    // Explicit previous day "2026-10-16" passed at 01:16 AM Cairo on Oct 17 -> must stay "2026-10-16" (not subtract twice)
    expect(resolveHospitalDutyDate('2026-10-16', oct17AfterMidnightUtc)).toBe('2026-10-16');

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

  it('handles outgoingMessageReceived webhooks when sent from the instance phone', async () => {
    const outgoingPayload = {
      typeWebhook: "outgoingMessageReceived",
      idMessage: "msg_out_" + Date.now(),
      senderData: {
        chatId: "120363345000178212@g.us",
        senderName: "Elite Hospital"
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: {
          textMessage:
            "Type: Request\n\nCategory: DoctorCall\n\nGroup: الجراحة العامة\n\nBy: Head Nurse\n\nDate: 14/10/2026 10:00:00 AM\n\nLocation: Elite 4th Floor\n\nSub.Location: Room 405\n\nPatient Name: احمد خالد\nBed: Bed 405"
        }
      }
    };

    const result = await processDoctorCallWebhook({
      rawBody: outgoingPayload,
      getActiveCheckins: async () => [
        {
          id: "301",
          doctorName: "Dr. General Surgeon",
          department: "General Surgery",
          shifts: ["Morning shift", "24 shift"],
          mobileNumber: "01000000002"
        }
      ]
    });

    expect(result.handled).toBe(true);
    expect(result.callRecord?.room).toBe("405");
    expect(result.callRecord?.department).toBe("General Surgery");
  });

  it('never drops a valid DoctorCall even if WHATSAPP_CALLS_SOURCE_GROUP_ID has a minor mismatch', async () => {
    const originalEnv = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID;
    try {
      // Simulate configured source group being different
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = "999999999999@g.us";

      const payload = {
        typeWebhook: "incomingMessageReceived",
        idMessage: "msg_mismatch_" + Date.now(),
        senderData: {
          chatId: "120363345000178212@g.us",
          senderName: "Hospital Group"
        },
        messageData: {
          typeMessage: "textMessage",
          textMessageData: {
            textMessage:
              "Type: Request\n\nCategory: DoctorCall\n\nGroup: الباطنة العامة\n\nBy: Nurse Station\n\nDate: 14/10/2026 11:00:00 AM\n\nLocation: Elite 2nd Floor\n\nSub.Location: Room 201\n\nPatient Name: سمير علي\nBed: Bed 201"
          }
        }
      };

      const result = await processDoctorCallWebhook({
        rawBody: payload,
        getActiveCheckins: async () => [
          {
            id: "401",
            doctorName: "Dr. Internal Med",
            department: "Internal Medicine",
            shifts: ["Morning shift", "24 shift"],
            mobileNumber: "01000000003"
          }
        ]
      });

      // Valid DoctorCall must NOT be dropped!
      expect(result.handled).toBe(true);
      expect(result.callRecord?.room).toBe("201");
      expect(result.callRecord?.department).toBe("Internal Medicine");
    } finally {
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = originalEnv;
    }
  });

  it('skips non-call chatter from unmonitored chats', async () => {
    const originalEnv = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID;
    try {
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = "120363345000178212@g.us";

      const payload = {
        typeWebhook: "incomingMessageReceived",
        idMessage: "msg_chat_" + Date.now(),
        senderData: {
          chatId: "999999999999@g.us",
          senderName: "Random Group"
        },
        messageData: {
          typeMessage: "textMessage",
          textMessageData: {
            textMessage: "Hello guys, anyone have lunch yet?"
          }
        }
      };

      const result = await processDoctorCallWebhook({
        rawBody: payload,
        getActiveCheckins: async () => []
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toContain("Ignored message from chat");
    } finally {
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = originalEnv;
    }
  });
});

describe('Green-API quotaExceeded Webhook Recovery & Journal API Polling', () => {
  it('recovers and dispatches source group DoctorCall via lastIncomingMessages (including delayed journal indexing) and includes Patient Name and MRN', async () => {
    const origId = process.env.GREEN_API_ID_INSTANCE;
    const origToken = process.env.GREEN_API_API_TOKEN_INSTANCE;
    const origSource = process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID;
    const origTarget = process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID;
    const origFetch = global.fetch;

    const uniqueMsgId = `3EB0_QUOTA_RECOVERY_${Date.now()}`;
    const uniquePatient = `مصطفي عبدالوهاب ${Date.now()}`;
    const uniqueMrn = "0000263656";
    let journalCallCount = 0;
    let sentWhatsAppPayload: any = null;

    try {
      process.env.GREEN_API_ID_INSTANCE = "7100000001";
      process.env.GREEN_API_API_TOKEN_INSTANCE = "test_token_123";
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = "120363345000178212@g.us";
      process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID = "120363041612395794@g.us";

      global.fetch = vi.fn(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/lastIncomingMessages/")) {
          journalCallCount++;
          // Simulate Green-API journal indexing delay: empty on attempt 1, populated on attempt 2
          if (journalCallCount === 1) {
            return { ok: true, json: async () => [] } as any;
          }
          return {
            ok: true,
            json: async () => [
              {
                type: "incoming",
                idMessage: uniqueMsgId,
                timestamp: Math.floor(Date.now() / 1000),
                typeMessage: "textMessage",
                chatId: "120363345000178212@g.us",
                textMessage:
                  `Type: Request\n\nCategory: DoctorCall\n\nGroup: الجراحة العامة\n\nBy: Ahmed Fathy\n\nDate: 15/10/2026 9:23:12 PM\n\nLocation: Elite 4th Floor\n\nSub.Location: Room 409\n\nPatient Barcode: ${uniqueMrn}\nPatient Name: ${uniquePatient}\nAdmitting Phys: Akram Assem\nBed: Bed 409`,
                senderId: "201103700026@c.us",
                senderName: "Elite Hospital"
              }
            ]
          } as any;
        }
        if (urlStr.includes("/lastOutgoingMessages/") || urlStr.includes("/getChatHistory/")) {
          return { ok: true, json: async () => [] } as any;
        }
        if (urlStr.includes("/sendMessage/")) {
          sentWhatsAppPayload = init?.body ? JSON.parse(init.body) : null;
          return { ok: true, json: async () => ({ idMessage: "sent_alert_123" }) } as any;
        }
        return { ok: true, json: async () => ({}) } as any;
      });

      const quotaPayload = {
        typeWebhook: "quotaExceeded",
        instanceData: { idInstance: 7100000001, wid: "201000000000@c.us", typeInstance: "whatsapp" },
        timestamp: Math.floor(Date.now() / 1000),
        quotaData: {
          method: "incomingMessageReceived",
          used: 3,
          total: 3,
          correspondents: ["120363041612395794@g.us", "201203886997-1605102717@g.us", "201000000001@c.us"],
          description: "Monthly quota has been exceeded. Allowed chats: 120363041612395794@g.us"
        }
      };

      const res = await processDoctorCallWebhook({
        rawBody: quotaPayload,
        getActiveCheckins: async () => [
          {
            id: "901",
            doctorName: "Dr. Recovered Surgeon",
            department: "General Surgery",
            shifts: ["Evening shift", "Night shift", "24 shift"],
            mobileNumber: "01012345678"
          }
        ]
      });

      expect(res.handled).toBe(true);
      expect(journalCallCount).toBeGreaterThanOrEqual(2);
      expect(res.callRecord?.id).toBe(`call_msg_${uniqueMsgId}`);
      expect(res.callRecord?.room).toBe("409");
      expect(res.callRecord?.department).toBe("General Surgery");
      expect(res.callRecord?.patientName).toBe(uniquePatient);
      expect(res.callRecord?.patientBarcode).toBe(uniqueMrn);
      expect(res.callRecord?.status).toBe("dispatched");
      expect(sentWhatsAppPayload?.message).toContain(`👤 *Patient:* ${uniquePatient}`);
      expect(sentWhatsAppPayload?.message).toContain(`🆔 *MRN:* ${uniqueMrn}`);

      // Subsequent poll must deduplicate and NOT dispatch the same message again
      const secondPoll = await pollGreenApiNotifications({
        getActiveCheckins: async () => [],
        skipQueueDrain: true
      });
      expect(secondPoll.handledCount).toBe(0);
    } finally {
      process.env.GREEN_API_ID_INSTANCE = origId;
      process.env.GREEN_API_API_TOKEN_INSTANCE = origToken;
      process.env.WHATSAPP_CALLS_SOURCE_GROUP_ID = origSource;
      process.env.WHATSAPP_DOCTORS_TARGET_GROUP_ID = origTarget;
      global.fetch = origFetch;
    }
  });
});

describe('Shift Boundaries & After 8 PM Night Shift Doctor Call Rule', () => {
  it('correctly maps shift intervals across the full 24-hour cycle', () => {
    // 07:59 AM - Night shift still active
    const at759AM = new Date("2026-10-18T07:59:00+03:00");
    const shifts759AM = getCairoActiveShifts(at759AM);
    expect(shifts759AM).toEqual(["Night shift", "24 shift"]);

    // 08:00 AM - Morning and Long shifts begin
    const at800AM = new Date("2026-10-18T08:00:00+03:00");
    const shifts800AM = getCairoActiveShifts(at800AM);
    expect(shifts800AM).toEqual(["Morning shift", "Long shift", "24 shift"]);

    // 01:59 PM (13:59) - Morning and Long shifts active
    const at159PM = new Date("2026-10-18T13:59:00+03:00");
    const shifts159PM = getCairoActiveShifts(at159PM);
    expect(shifts159PM).toEqual(["Morning shift", "Long shift", "24 shift"]);

    // 02:00 PM (14:00) - Morning ends, Evening begins; Long continues
    const at200PM = new Date("2026-10-18T14:00:00+03:00");
    const shifts200PM = getCairoActiveShifts(at200PM);
    expect(shifts200PM).toEqual(["Long shift", "Evening shift", "24 shift"]);

    // 07:59 PM (19:59) - Evening and Long active
    const at759PM = new Date("2026-10-18T19:59:00+03:00");
    const shifts759PM = getCairoActiveShifts(at759PM);
    expect(shifts759PM).toEqual(["Long shift", "Evening shift", "24 shift"]);

    // 08:00 PM (20:00) - Long & Evening end, Night shift starts
    const at800PM = new Date("2026-10-18T20:00:00+03:00");
    const shifts800PM = getCairoActiveShifts(at800PM);
    expect(shifts800PM).toEqual(["Night shift", "24 shift"]);

    // 11:30 PM (23:30) - Night shift
    const at1130PM = new Date("2026-10-18T23:30:00+03:00");
    const shifts1130PM = getCairoActiveShifts(at1130PM);
    expect(shifts1130PM).toEqual(["Night shift", "24 shift"]);

    // 03:00 AM - Night shift
    const at3AM = new Date("2026-10-19T03:00:00+03:00");
    const shifts3AM = getCairoActiveShifts(at3AM);
    expect(shifts3AM).toEqual(["Night shift", "24 shift"]);
  });

  it('matchesActiveShift accepts only night shifts after 8 PM', () => {
    const nightWindow = ["Night shift", "24 shift"];

    // Evening shift only - must NOT match
    expect(matchesActiveShift(["Evening shift"], nightWindow)).toBe(false);
    expect(matchesActiveShift(["ايڤينينج"], nightWindow)).toBe(false);

    // Long shift only - must NOT match
    expect(matchesActiveShift(["Long shift"], nightWindow)).toBe(false);
    expect(matchesActiveShift(["لونج"], nightWindow)).toBe(false);

    // Morning shift only - must NOT match
    expect(matchesActiveShift(["Morning shift"], nightWindow)).toBe(false);
    expect(matchesActiveShift(["مورنينج"], nightWindow)).toBe(false);

    // Night shift - must match
    expect(matchesActiveShift(["Night shift"], nightWindow)).toBe(true);
    expect(matchesActiveShift(["نايت"], nightWindow)).toBe(true);

    // 24 shift - must match
    expect(matchesActiveShift(["24 shift"], nightWindow)).toBe(true);
    expect(matchesActiveShift(["24"], nightWindow)).toBe(true);

    // Multiple shifts including Night shift - must match
    expect(matchesActiveShift(["Evening shift", "Night shift"], nightWindow)).toBe(true);
  });

  it('dispatches only doctors with night shifts when call arrives after 8 PM', async () => {
    const callAfter8PM =
      "Type: Request\n" +
      "Category: DoctorCall\n" +
      "Group: الجراحة العامة\n" +
      "By: Nurse Station\n" +
      "Date: 14/10/2026 8:30:00 م\n" +
      "Location: Elite 3rd Floor\n" +
      "Sub.Location: Room 302\n" +
      "Patient Name: طارق محمود\n" +
      "Bed: Bed 302";

    const payload = {
      typeWebhook: "incomingMessageReceived",
      idMessage: "msg_after_8pm_" + Date.now(),
      senderData: {
        chatId: "120363345000178212@g.us",
        senderName: "Elite Hospital"
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: callAfter8PM }
      }
    };

    const mockCheckins = [
      {
        id: "doc_eve",
        doctorName: "Dr. Evening Only",
        department: "General Surgery",
        shifts: ["Evening shift"],
        mobileNumber: "01011111111"
      },
      {
        id: "doc_night",
        doctorName: "Dr. Night Surgeon",
        department: "General Surgery",
        shifts: ["Night shift"],
        mobileNumber: "01022222222"
      }
    ];

    const result = await processDoctorCallWebhook({
      rawBody: payload,
      getActiveCheckins: async () => mockCheckins
    });

    expect(result.handled).toBe(true);
    expect(result.callRecord?.dispatchedDoctors).toHaveLength(1);
    expect(result.callRecord?.dispatchedDoctors[0].name).toBe("Dr. Night Surgeon");
  });

  it('does NOT fall back to daytime or evening doctors after 8 PM if no night doctor is present', async () => {
    const callAfter8PM =
      "Type: Request\n" +
      "Category: DoctorCall\n" +
      "Group: الباطنة العامة\n" +
      "By: Night Nurse\n" +
      "Date: 14/10/2026 9:15:00 م\n" +
      "Location: Elite 2nd Floor\n" +
      "Sub.Location: Room 205\n" +
      "Patient Name: خالد علي\n" +
      "Bed: Bed 205";

    const payload = {
      typeWebhook: "incomingMessageReceived",
      idMessage: "msg_night_no_doc_" + Date.now(),
      senderData: {
        chatId: "120363345000178212@g.us",
        senderName: "Elite Hospital"
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: callAfter8PM }
      }
    };

    // Only Morning and Evening doctors checked in today, no Night or 24 shift doctors
    const mockCheckins = [
      {
        id: "doc_morning",
        doctorName: "Dr. Day Doctor",
        department: "Internal Medicine",
        shifts: ["Morning shift"],
        mobileNumber: "01033333333"
      },
      {
        id: "doc_eve",
        doctorName: "Dr. Evening Doctor",
        department: "Internal Medicine",
        shifts: ["Evening shift"],
        mobileNumber: "01044444444"
      }
    ];

    const result = await processDoctorCallWebhook({
      rawBody: payload,
      getActiveCheckins: async () => mockCheckins
    });

    // Must be logged as no_doctor_present and MUST NOT dispatch to off-shift daytime/evening doctors
    expect(result.handled).toBe(true);
    expect(result.callRecord?.status).toBe("no_doctor_present");
    expect(result.callRecord?.dispatchedDoctors).toHaveLength(0);
  });
});





