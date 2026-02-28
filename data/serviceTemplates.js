export const SERVICE_TYPES = [
  { id: "standard", name: "Standard Service", special: false, leadDays: 21 },
  { id: "communion", name: "Communion Service", special: true, leadDays: 14 },
  { id: "easter", name: "Easter Service", special: true, leadDays: 30 },
  { id: "christmas", name: "Christmas Service", special: true, leadDays: 30 },
  { id: "conference", name: "Conference / Special Event", special: true, leadDays: 30 },
  { id: "youth", name: "Youth Night", special: false, leadDays: 21 },
  { id: "rehearsal", name: "Rehearsal", special: false, leadDays: 21 },
];

export function getServiceTypeMeta(serviceTypeId) {
  return SERVICE_TYPES.find(t => t.id === serviceTypeId) || SERVICE_TYPES[0];
}

export function defaultServiceTypeId() {
  return "standard";
}
