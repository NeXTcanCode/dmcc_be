import mongoose from 'mongoose';

const walletLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['recharge', 'deduction'], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' }
  },
  { timestamps: true }
);

export default mongoose.model('WalletLog', walletLogSchema);
