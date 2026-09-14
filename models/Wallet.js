import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currentBalance: { type: Number, required: true, default: 0, min: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model('Wallet', walletSchema);
