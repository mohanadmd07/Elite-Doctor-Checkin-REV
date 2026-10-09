import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import { normalizeSpecialty, CANONICAL_SPECIALTIES } from '../src/data/specialties.js';
import { COMPILED_DOCTORS } from '../src/data/compiledDoctors.js';

console.log('--- STANDARDIZING LOCAL DOCTOR DATASETS ---');

// 1. Process src/data/doctors.ts from COMPILED_DOCTORS (raw source of truth)
const doctorsTsPath = path.join(rootDir, 'src', 'data', 'doctors.ts');
const rawDocs = COMPILED_DOCTORS;

let updatedActive = 0;
let updatedInactive = 0;
const counts = {};

const standardizedDocs = rawDocs.map(doc => {
  const norm = normalizeSpecialty(doc.department);
  if (norm.active) {
    updatedActive++;
    counts[norm.department] = (counts[norm.department] || 0) + 1;
    return {
      ...doc,
      department: norm.department,
      isActive: true,
    };
  } else {
    updatedInactive++;
    return {
      ...doc,
      department: norm.department,
      isActive: false,
    };
  }
});

const newDoctorsTs = `export interface Doctor {
  id: string;
  name: string;
  arabicName: string;
  department: string;
  mobileNumber?: string;
  isActive?: boolean;
}

export const DOCTORS_DATABASE: Doctor[] = ${JSON.stringify(standardizedDocs, null, 2)};
`;

fs.writeFileSync(doctorsTsPath, newDoctorsTs, 'utf8');
console.log(`Updated ${doctorsTsPath}: ${updatedActive} active, ${updatedInactive} inactive.`);
console.log('Breakdown by specialty:');
console.table(counts);

// 2. Process data/custom_doctors.json if exists
const customPath = path.join(rootDir, 'data', 'custom_doctors.json');
if (fs.existsSync(customPath)) {
  try {
    const customList = JSON.parse(fs.readFileSync(customPath, 'utf8'));
    if (Array.isArray(customList)) {
      const updatedCustom = customList.map(doc => {
        const norm = normalizeSpecialty(doc.department);
        return {
          ...doc,
          department: norm.department,
        };
      });
      fs.writeFileSync(customPath, JSON.stringify(updatedCustom, null, 2), 'utf8');
      console.log(`Updated ${customPath} (${updatedCustom.length} records).`);
    }
  } catch (err) {
    console.error('Error updating custom_doctors.json:', err);
  }
}

// Build fast lookup map for doctor authoritative specialties
const docSpecialtyMap = new Map();
standardizedDocs.forEach(d => {
  const cleanId = (d.id || '').trim().toLowerCase().replace(/^(emp\.|emp)/i, '');
  if (cleanId) docSpecialtyMap.set(cleanId, d.department);
  if (d.name) docSpecialtyMap.set(d.name.trim().toLowerCase(), d.department);
});

// Helper to normalize any checkin with doctor's canonical department
const normalizeCheckinRecord = (c) => {
  const cleanId = (c.id || '').trim().toLowerCase().replace(/^(emp\.|emp)/i, '');
  const nameLower = (c.doctorName || '').trim().toLowerCase();
  const canonicalDept = docSpecialtyMap.get(cleanId) || docSpecialtyMap.get(nameLower) || normalizeSpecialty(c.department).department;
  return {
    ...c,
    department: canonicalDept,
  };
};

// 3. Process data/weekly_checkins.json if exists
const weeklyPath = path.join(rootDir, 'data', 'weekly_checkins.json');
if (fs.existsSync(weeklyPath)) {
  try {
    const weeklyList = JSON.parse(fs.readFileSync(weeklyPath, 'utf8'));
    if (Array.isArray(weeklyList)) {
      const updatedWeekly = weeklyList.map(normalizeCheckinRecord);
      fs.writeFileSync(weeklyPath, JSON.stringify(updatedWeekly, null, 2), 'utf8');
      console.log(`Updated ${weeklyPath} (${updatedWeekly.length} records).`);
    }
  } catch (err) {
    console.error('Error updating weekly_checkins.json:', err);
  }
}

// 4. Process data/monthly_checkins.json if exists
const monthlyPath = path.join(rootDir, 'data', 'monthly_checkins.json');
if (fs.existsSync(monthlyPath)) {
  try {
    const monthlyList = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));
    if (Array.isArray(monthlyList)) {
      const updatedMonthly = monthlyList.map(normalizeCheckinRecord);
      fs.writeFileSync(monthlyPath, JSON.stringify(updatedMonthly, null, 2), 'utf8');
      console.log(`Updated ${monthlyPath} (${updatedMonthly.length} records).`);
    }
  } catch (err) {
    console.error('Error updating monthly_checkins.json:', err);
  }
}

// 5. Process data/checkins.json if exists
const checkinsPath = path.join(rootDir, 'data', 'checkins.json');
if (fs.existsSync(checkinsPath)) {
  try {
    const checkinsList = JSON.parse(fs.readFileSync(checkinsPath, 'utf8'));
    if (Array.isArray(checkinsList)) {
      const updatedCheckins = checkinsList.map(normalizeCheckinRecord);
      fs.writeFileSync(checkinsPath, JSON.stringify(updatedCheckins, null, 2), 'utf8');
      console.log(`Updated ${checkinsPath} (${updatedCheckins.length} records).`);
    }
  } catch (err) {
    console.error('Error updating checkins.json:', err);
  }
}

console.log('--- LOCAL DATA STANDARDIZATION COMPLETE ---');
