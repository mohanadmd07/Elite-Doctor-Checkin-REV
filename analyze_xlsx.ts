import { DOCTORS_DATABASE } from "./src/data/doctors.ts";

const withEmp = DOCTORS_DATABASE.filter(d => d.id.toLowerCase().includes("emp"));
console.log(`Total: ${DOCTORS_DATABASE.length}`);
console.log(`With 'emp': ${withEmp.length}`);
console.log(`Without 'emp': ${DOCTORS_DATABASE.length - withEmp.length}`);
