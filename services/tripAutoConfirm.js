import Trip from '../models/Trip.js';
import { chargeTrip } from './tripCharge.js';

// Pending trips left unapproved past their expiry are confirmed and charged
// (up to the available balance) so the fare never silently disappears from
// the pending total without being deducted.
export const autoConfirmExpiredTrips = async (userId) => {
  const expired = await Trip.find({ userId, status: 'pending', expiresAt: { $lte: new Date() } }, '_id');
  for (const { _id } of expired) {
    await chargeTrip({ tripId: _id, userId, status: 'autoConfirmed', allowPartial: true });
  }
};
