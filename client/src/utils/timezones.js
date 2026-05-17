/**
 * Curated country → IANA timezone map.
 * Covers the most common regions for Nos Market customers.
 */
export const COUNTRY_TIMEZONES = [
  { country: 'United States', code: 'US', zone: 'America/New_York', flag: '🇺🇸' },
  { country: 'United States (Pacific)', code: 'US-PAC', zone: 'America/Los_Angeles', flag: '🇺🇸' },
  { country: 'United States (Mountain)', code: 'US-MTN', zone: 'America/Denver', flag: '🇺🇸' },
  { country: 'United States (Central)', code: 'US-CTR', zone: 'America/Chicago', flag: '🇺🇸' },
  { country: 'Vietnam', code: 'VN', zone: 'Asia/Ho_Chi_Minh', flag: '🇻🇳' },
  { country: 'United Kingdom', code: 'UK', zone: 'Europe/London', flag: '🇬🇧' },
  { country: 'Germany', code: 'DE', zone: 'Europe/Berlin', flag: '🇩🇪' },
  { country: 'France', code: 'FR', zone: 'Europe/Paris', flag: '🇫🇷' },
  { country: 'Spain', code: 'ES', zone: 'Europe/Madrid', flag: '🇪🇸' },
  { country: 'Italy', code: 'IT', zone: 'Europe/Rome', flag: '🇮🇹' },
  { country: 'Netherlands', code: 'NL', zone: 'Europe/Amsterdam', flag: '🇳🇱' },
  { country: 'Poland', code: 'PL', zone: 'Europe/Warsaw', flag: '🇵🇱' },
  { country: 'Sweden', code: 'SE', zone: 'Europe/Stockholm', flag: '🇸🇪' },
  { country: 'Canada', code: 'CA', zone: 'America/Toronto', flag: '🇨🇦' },
  { country: 'Australia', code: 'AU', zone: 'Australia/Sydney', flag: '🇦🇺' },
  { country: 'Japan', code: 'JP', zone: 'Asia/Tokyo', flag: '🇯🇵' },
  { country: 'South Korea', code: 'KR', zone: 'Asia/Seoul', flag: '🇰🇷' },
  { country: 'Singapore', code: 'SG', zone: 'Asia/Singapore', flag: '🇸🇬' },
  { country: 'Brazil', code: 'BR', zone: 'America/Sao_Paulo', flag: '🇧🇷' },
  { country: 'Argentina', code: 'AR', zone: 'America/Argentina/Buenos_Aires', flag: '🇦🇷' },
  { country: 'Mexico', code: 'MX', zone: 'America/Mexico_City', flag: '🇲🇽' },
  { country: 'Other / UTC', code: 'UTC', zone: 'UTC', flag: '🌐' }
];

/**
 * Get the IANA timezone string for a given country code.
 */
export function getTimezoneByCode(code) {
  const match = COUNTRY_TIMEZONES.find((c) => c.code === code);
  return match ? match.zone : 'UTC';
}

/**
 * Format a Date object in a given timezone, returning a readable date string.
 */
export function formatDateInTimezone(dateValue, timezone) {
  if (!dateValue) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: String(timezone || 'UTC'),
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateValue));
  } catch {
    return String(dateValue);
  }
}

/**
 * Group an array of delivery slots by date (in the customer's timezone).
 */
export function groupSlotsByDate(slots, timezone = 'UTC') {
  if (!Array.isArray(slots) || slots.length === 0) return {};
  return slots.reduce((groups, slot) => {
    const dateKey = (() => {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(slot.startAt));
      } catch {
        return 'Unknown';
      }
    })();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(slot);
    return groups;
  }, {});
}
