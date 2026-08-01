export function parseServiceTimeInput(raw) {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;

  const compact = value.replace(/\s+/g, '');
  const hhmm = compact.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    return buildParsedTime(hours, minutes);
  }

  const ampm = compact.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2] || 0);
    const period = ampm[3];
    if (hours < 1 || hours > 12) return null;
    if (period === 'am') {
      if (hours === 12) hours = 0;
    } else if (hours !== 12) {
      hours += 12;
    }
    return buildParsedTime(hours, minutes);
  }

  return null;
}

export function normalizeServiceTime(raw, fallback = '') {
  const parsed = parseServiceTimeInput(raw);
  if (parsed) return parsed.value;
  return fallback;
}

export function formatServiceTime(raw, fallback = '') {
  const parsed = parseServiceTimeInput(raw);
  if (!parsed) return fallback;
  return parsed.display;
}

export function getServiceDateKey(serviceDate) {
  if (!serviceDate) return '';
  return String(serviceDate).split('T')[0];
}

export function getServiceTimeKey(assignment = {}) {
  const explicit = normalizeServiceTime(
    assignment.service_time || assignment.time || assignment.serviceTime || '',
  );
  if (explicit) return explicit;

  const serviceDate = assignment.service_date || assignment.date || assignment.serviceDate || '';
  const match = String(serviceDate).match(/T(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return normalizeServiceTime(`${match[1]}:${match[2]}`);
}

export function parseServiceDateTime(assignment = {}, fallbackTime = '10:00') {
  const serviceDate = assignment.service_date || assignment.date || assignment.serviceDate || '';
  if (!serviceDate) return null;

  const dateKey = getServiceDateKey(serviceDate);
  const timeKey = getServiceTimeKey(assignment) || normalizeServiceTime(fallbackTime, fallbackTime);
  const candidate = dateKey && timeKey
    ? `${dateKey}T${timeKey}:00`
    : String(serviceDate);
  const date = new Date(candidate);
  return Number.isFinite(date.getTime()) ? date : null;
}

function buildParsedTime(hours, minutes) {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const display = `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
  return { value, hours, minutes, display };
}
