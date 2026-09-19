import { Router } from 'express';
import Trip from '../models/Trip.js';
import { authMiddleware } from '../middleware/auth.js';
import { calculateDMRCFare } from '../services/fareCalculator.js';
import { resolveFare } from '../services/externalFareService.js';
import { autoConfirmExpiredTrips } from '../services/tripAutoConfirm.js';
import { chargeTrip } from '../services/tripCharge.js';

const router = Router();
router.use(authMiddleware);

router.post('/pending', async (req, res) => {
  try {
    const {
      boardingStationId,
      alightingStationId = '',
      boardingStationName,
      alightingStationName,
      distanceKm,
      isSmartCard = true,
      travelDate
    } = req.body;

    if (!boardingStationId || typeof distanceKm !== 'number') {
      return res.status(400).json({ message: 'boardingStationId and distanceKm are required' });
    }

    const date = travelDate ? new Date(travelDate) : new Date();

    let fare;
    let fareSource = 'local';
    if (boardingStationName && alightingStationName) {
      const resolved = await resolveFare({
        fromStationName: boardingStationName,
        toStationName: alightingStationName,
        distanceKm,
        travelDate: date,
        isSmartCard
      });
      fare = resolved.fare;
      fareSource = resolved.source;
    } else {
      fare = calculateDMRCFare(distanceKm, date, isSmartCard);
    }

    const trip = await Trip.create({
      userId: req.user.id,
      boardingStationId,
      alightingStationId,
      distanceKm,
      fare,
      fareSource,
      date,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    return res.status(201).json(trip);
  } catch (error) {
    return res.status(500).json({ message: 'Could not create pending trip', detail: error.message });
  }
});

router.put('/:id/confirm', async (req, res) => {
  try {
    const result = await chargeTrip({ tripId: req.params.id, userId: req.user.id });
    if (!result.ok && result.reason === 'insufficient') {
      return res.status(400).json({
        message: `Insufficient wallet balance: fare is INR ${result.fare}, balance is INR ${result.balance}. Recharge and confirm again.`
      });
    }
    if (!result.ok) {
      const exists = await Trip.exists({ _id: req.params.id, userId: req.user.id });
      return exists
        ? res.status(400).json({ message: 'Only pending trip can be confirmed' })
        : res.status(404).json({ message: 'Trip not found' });
    }
    const trip = result.trip;

    return res.json(trip);
  } catch (error) {
    return res.status(500).json({ message: 'Could not confirm trip', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Trip.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) return res.status(404).json({ message: 'Trip not found' });
    return res.json({ message: 'Trip deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not delete trip', detail: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await autoConfirmExpiredTrips(req.user.id);
    const trips = await Trip.find({ userId: req.user.id }).sort({ date: -1 });
    return res.json(trips);
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch trips', detail: error.message });
  }
});

export default router;
