import dayjs from 'dayjs';

const WEEKDAY_SLABS = [
  { maxKm: 2, fare: 11 },
  { maxKm: 5, fare: 21 },
  { maxKm: 12, fare: 32 },
  { maxKm: 21, fare: 43 },
  { maxKm: 32, fare: 54 },
  { maxKm: Infinity, fare: 64 }
];

const HOLIDAY_SLABS = [
  { maxKm: 2, fare: 11 },
  { maxKm: 5, fare: 11 },
  { maxKm: 12, fare: 21 },
  { maxKm: 21, fare: 32 },
  { maxKm: 32, fare: 43 },
  { maxKm: Infinity, fare: 54 }
];

const NATIONAL_HOLIDAYS = ['01-26', '08-15', '10-02'];

export const isConcessionDay = (travelDate = new Date()) => {
  const date = dayjs(travelDate);
  return date.day() === 0 || NATIONAL_HOLIDAYS.includes(date.format('MM-DD'));
};

export const calculateDMRCFare = (distanceKm, travelDate = new Date(), isSmartCard = true) => {
  const date = dayjs(travelDate);
  const isSunday = date.day() === 0;
  const isHoliday = NATIONAL_HOLIDAYS.includes(date.format('MM-DD'));
  const slabs = isSunday || isHoliday ? HOLIDAY_SLABS : WEEKDAY_SLABS;

  let baseFare = 11;
  for (const slab of slabs) {
    if (distanceKm <= slab.maxKm) {
      baseFare = slab.fare;
      break;
    }
  }

  let finalFare = baseFare;
  if (isSmartCard && !(isSunday || isHoliday)) {
    const hour = date.hour();
    const offPeak = hour < 8 || (hour >= 12 && hour < 17) || hour >= 21;
    if (offPeak) finalFare = Math.round(baseFare * 0.9);
  }

  return Math.max(11, finalFare);
};
