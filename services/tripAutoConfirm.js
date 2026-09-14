import Trip from '../models/Trip.js';

export const autoConfirmExpiredTrips = async (userId) => {
  const now = new Date();
  await Trip.updateMany(
    { userId, status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'autoConfirmed' } }
  );
};
