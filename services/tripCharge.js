import Trip from '../models/Trip.js';
import Wallet from '../models/Wallet.js';
import WalletLog from '../models/WalletLog.js';

// Moves a pending trip to `status` and takes its fare from the wallet.
// The status flip is a conditional update, so a trip can only be charged once
// even if confirm and auto-confirm race. If the wallet can't cover the fare the
// trip goes back to pending and nothing is deducted.
export const chargeTrip = async ({ tripId, userId, status = 'confirmed', allowPartial = false }) => {
  const trip = await Trip.findOneAndUpdate(
    { _id: tripId, userId, status: 'pending' },
    { $set: { status } },
    { new: true }
  );
  if (!trip) return { ok: false, reason: 'not_pending' };

  const revert = () => Trip.updateOne({ _id: trip._id }, { $set: { status: 'pending' } });

  let charged = trip.fare;
  let wallet = await Wallet.findOneAndUpdate(
    { userId, currentBalance: { $gte: charged } },
    { $inc: { currentBalance: -charged }, $set: { lastUpdated: new Date() } },
    { new: true }
  );

  if (!wallet && allowPartial) {
    // Auto-confirm: take whatever is left rather than leaving the trip unpaid forever.
    const current = await Wallet.findOne({ userId });
    charged = current ? current.currentBalance : 0;
    if (charged > 0) {
      wallet = await Wallet.findOneAndUpdate(
        { userId, currentBalance: { $gte: charged } },
        { $inc: { currentBalance: -charged }, $set: { lastUpdated: new Date() } },
        { new: true }
      );
    } else {
      wallet = current;
    }
  }

  if (!wallet) {
    await revert();
    const current = await Wallet.findOne({ userId });
    return { ok: false, reason: 'insufficient', balance: current?.currentBalance ?? 0, fare: trip.fare };
  }

  if (charged > 0) {
    await WalletLog.create({
      userId,
      type: 'deduction',
      amount: charged,
      note: `trip:${trip._id}`
    });
  }
  return { ok: true, trip, currentBalance: wallet.currentBalance };
};
