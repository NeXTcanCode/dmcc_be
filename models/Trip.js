import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    boardingStationId: { type: String, required: true },
    alightingStationId: { type: String, default: '' },
    distanceKm: { type: Number, required: true, min: 0 },
    fare: { type: Number, required: true, min: 0 },
    fareSource: { type: String, enum: ['local', 'external'], default: 'local' },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'autoConfirmed'],
      default: 'pending',
      index: true
    },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export default mongoose.model('Trip', tripSchema);
