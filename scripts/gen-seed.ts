import { PORTFOLIO, EMPLOYEES, seedUnits, seedAssignments, seedBookings } from '../src/lib/mockData.ts';
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
console.log(
  JSON.stringify({
    portfolio: PORTFOLIO,
    employees: EMPLOYEES,
    units: seedUnits(),
    assignments: seedAssignments(),
    bookings: seedBookings(today),
  })
);
