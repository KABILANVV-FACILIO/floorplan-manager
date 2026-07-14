import type { Assignments, Booking, Employee, Site, Unit } from './types';

export const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Priya Kumar', dept: 'Operations' },
  { id: 'e2', name: 'Jonas Weber', dept: 'Engineering' },
  { id: 'e3', name: 'Maria Silva', dept: 'Finance' },
  { id: 'e4', name: 'Anna Schmidt', dept: 'HR' },
  { id: 'e5', name: 'David Chen', dept: 'Engineering' },
  { id: 'e6', name: 'Lena Hoffmann', dept: 'Operations' },
  { id: 'e7', name: 'Tom Becker', dept: 'Engineering' },
  { id: 'e8', name: 'Sofia Rossi', dept: 'Finance' },
  { id: 'e9', name: 'Mark Janssen', dept: 'Operations' },
  { id: 'e10', name: 'Emma Fischer', dept: 'Engineering' },
  { id: 'e11', name: 'Lukas Braun', dept: 'HR' },
  { id: 'e12', name: 'Nina Keller', dept: 'Operations' },
  { id: 'e13', name: 'Omar Haddad', dept: 'Engineering' },
  { id: 'e14', name: 'Julia Wagner', dept: 'Finance' },
];

export const PORTFOLIO: Site[] = [
  {
    id: 'sBer',
    name: 'HQ Berlin',
    buildings: [
      {
        id: 'bA',
        name: 'Building A',
        floors: [
          { id: 'hqA1', name: 'Floor 1' },
          { id: 'hqA2', name: 'Floor 2' },
          {
            id: 'hqA3',
            name: 'Floor 3',
            hasPlan: true,
            plans: [
              { id: 'workstation', name: 'Workstations' },
              { id: 'locker', name: 'Lockers' },
              { id: 'parking', name: 'Parking stalls' },
              { id: 'custom', name: 'Custom' },
            ],
          },
          { id: 'hqA4', name: 'Floor 4' },
        ],
      },
      {
        id: 'bB',
        name: 'Building B',
        floors: [
          { id: 'hqB1', name: 'Floor 1' },
          { id: 'hqB2', name: 'Floor 2' },
        ],
      },
    ],
  },
  {
    id: 'sMuc',
    name: 'Campus München',
    buildings: [
      {
        id: 'mH1',
        name: 'Haus 1',
        floors: [
          { id: 'mucH1EG', name: 'Erdgeschoss' },
          { id: 'mucH1O1', name: 'Obergeschoss 1' },
        ],
      },
    ],
  },
  {
    id: 'sAms',
    name: 'Amsterdam Office',
    buildings: [
      {
        id: 'aM',
        name: 'Main building',
        floors: [{ id: 'amsM1', name: 'Floor 1' }],
      },
    ],
  },
];

function planForType(type: Unit['type']): Unit['plan'] {
  if (type === 'workstation' || type === 'locker' || type === 'parking') return type;
  return 'custom';
}

export function seedUnits(): Unit[] {
  const U: Omit<Unit, 'plan'>[] = [];
  const ws: [number, number, string][] = [
    [0.083, 0.115, 'Büro 1'], [0.083, 0.16, 'Büro 1'], [0.083, 0.205, 'Büro 1'],
    [0.125, 0.115, 'Büro 1'], [0.125, 0.16, 'Büro 1'], [0.125, 0.205, 'Büro 1'],
    [0.318, 0.115, 'Büro 2'], [0.318, 0.16, 'Büro 2'], [0.318, 0.205, 'Büro 2'],
    [0.362, 0.115, 'Büro 2'], [0.362, 0.16, 'Büro 2'], [0.362, 0.205, 'Büro 2'],
    [0.655, 0.125, 'Büro 4'], [0.655, 0.175, 'Büro 4'], [0.702, 0.125, 'Büro 4'], [0.702, 0.175, 'Büro 4'],
    [0.838, 0.79, 'Büro 9'], [0.838, 0.865, 'Büro 9'], [0.926, 0.79, 'Büro 9'], [0.926, 0.865, 'Büro 9'],
    [0.7, 0.79, 'Büro 10'], [0.7, 0.865, 'Büro 10'],
    [0.075, 0.79, 'Büro 12'], [0.075, 0.865, 'Büro 12'],
  ];
  const seatTypes = [
    'Sit-stand · dual monitor',
    'Fixed · single monitor',
    'Window seat · sit-stand',
    'Standard · docking',
    'Corner · dual monitor',
    'Standard · single monitor',
  ];
  ws.forEach((w, i) => {
    U.push({
      id: 'ws' + (i + 1),
      type: 'workstation',
      label: 'WS-' + String(i + 1).padStart(2, '0'),
      secondary: seatTypes[i % seatTypes.length],
      room: w[2],
      geom: { kind: 'point', x: w[0], y: w[1] },
      floor: 'hqA3',
    });
  });
  for (let i = 0; i < 8; i++) {
    U.push({
      id: 'lk' + (i + 1),
      type: 'locker',
      label: 'L-' + String(i + 1).padStart(2, '0'),
      room: 'Flur',
      geom: { kind: 'point', x: 0.058 + i * 0.0135, y: 0.343 },
      floor: 'hqA3',
    });
  }
  U.push({
    id: 'rm1', type: 'room', label: 'Konferenzraum 1', room: null,
    geom: { kind: 'poly', pts: [[0.492, 0.735], [0.618, 0.735], [0.618, 0.955], [0.492, 0.955]] },
    floor: 'hqA3',
  });
  U.push({
    id: 'rm2', type: 'room', label: 'Konferenzraum 2', room: null,
    geom: { kind: 'poly', pts: [[0.148, 0.7], [0.385, 0.7], [0.385, 0.955], [0.148, 0.955]] },
    floor: 'hqA3',
  });
  U.push({
    id: 'rm3', type: 'room', label: 'Ruheraum', room: null,
    geom: { kind: 'poly', pts: [[0.033, 0.36], [0.155, 0.36], [0.155, 0.44], [0.033, 0.44]] },
    floor: 'hqA3',
  });
  const pk: [number, number][] = [[0.44, 0.6], [0.47, 0.6], [0.5, 0.6], [0.44, 0.66], [0.47, 0.66], [0.5, 0.66]];
  pk.forEach((p, i) => {
    U.push({
      id: 'pk' + (i + 1),
      type: 'parking',
      label: 'P-' + String(i + 1).padStart(2, '0'),
      room: null,
      geom: { kind: 'point', x: p[0], y: p[1] },
      floor: 'hqA3',
    });
  });
  return U.map((u) => ({ ...u, plan: planForType(u.type) }));
}

export function seedAssignments(): Assignments {
  return { ws1: 'e1', ws2: 'e2', ws4: 'e3', ws7: 'e4', ws9: 'e5', ws13: 'e6', ws17: 'e7', ws21: 'e8' };
}

export function seedBookings(date: string): Booking[] {
  return [
    { id: 'b1', unitId: 'rm1', date, start: 540, end: 630, by: 'e2', purpose: 'Sprint planning' },
    { id: 'b2', unitId: 'rm2', date, start: 840, end: 900, by: 'e9', purpose: 'Client review' },
    { id: 'b3', unitId: 'ws10', date, start: 540, end: 1020, by: 'e14', purpose: 'Visitor desk' },
    { id: 'b4', unitId: 'rm3', date, start: 780, end: 810, by: 'e6', purpose: '' },
  ];
}

export const IMG_W = 1492;
export const IMG_H = 1054;
