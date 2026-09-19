import { Router } from 'express';
import Wallet from '../models/Wallet.js';
import Trip from '../models/Trip.js';
import WalletLog from '../models/WalletLog.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
const MAX_BALANCE = 3000;
const AUTO_CLEAR_DAYS = 7;

const getAutoClearCutoff = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUTO_CLEAR_DAYS);
  return cutoff;
};

router.get('/', async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    const pending = await Trip.aggregate([
      { $match: { userId: wallet.userId, status: 'pending' } },
      { $group: { _id: null, amount: { $sum: '$fare' } } }
    ]);

    const pendingDeduction = pending[0]?.amount || 0;

    return res.json({
      currentBalance: wallet.currentBalance,
      pendingDeduction,
      availableBalance: Math.max(0, wallet.currentBalance - pendingDeduction)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch wallet', detail: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { currentBalance } = req.body;
    if (typeof currentBalance !== 'number' || currentBalance < 0 || currentBalance > MAX_BALANCE) {
      return res.status(400).json({ message: `currentBalance must be between 0 and ${MAX_BALANCE}` });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { currentBalance, lastUpdated: new Date() } },
      { new: true, upsert: true }
    );

    return res.json(wallet);
  } catch (error) {
    return res.status(500).json({ message: 'Could not update wallet', detail: error.message });
  }
});

router.post('/recharge', async (req, res) => {
  try {
    const { amount, mode = 'online' } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    const isCustomerCare = mode === 'customer_care';
    const minAmount = isCustomerCare ? 200 : 100;
    const step = isCustomerCare ? 100 : 50;

    if (amount < minAmount || amount % step !== 0) {
      return res.status(400).json({
        message: isCustomerCare
          ? 'Customer care recharge: minimum 200 and multiples of 100'
          : 'Online/TVM recharge: minimum 100 and multiples of 50'
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    const nextBalance = wallet.currentBalance + amount;
    if (nextBalance > MAX_BALANCE) {
      return res.status(400).json({
        message: `Recharge exceeds max card limit of ${MAX_BALANCE}`,
        currentBalance: wallet.currentBalance,
        maxAllowedRecharge: Math.max(0, MAX_BALANCE - wallet.currentBalance)
      });
    }

    wallet.currentBalance = nextBalance;
    wallet.lastUpdated = new Date();
    await wallet.save();
    await WalletLog.create({
      userId: req.user.id,
      type: 'recharge',
      amount,
      note: mode
    });

    return res.json({
      currentBalance: wallet.currentBalance,
      maxBalance: MAX_BALANCE,
      remainingCapacity: Math.max(0, MAX_BALANCE - wallet.currentBalance)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not recharge wallet', detail: error.message });
  }
});

router.post('/debit', async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    if (amount > wallet.currentBalance) {
      return res.status(400).json({
        message: `Debit exceeds current balance. You can debit up to INR ${wallet.currentBalance}.`
      });
    }

    wallet.currentBalance = wallet.currentBalance - amount;
    wallet.lastUpdated = new Date();
    await wallet.save();
    await WalletLog.create({
      userId: req.user.id,
      type: 'deduction',
      amount,
      note: 'manual_rectification'
    });

    return res.json({
      currentBalance: wallet.currentBalance,
      maxBalance: MAX_BALANCE,
      remainingCapacity: Math.max(0, MAX_BALANCE - wallet.currentBalance)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not debit wallet', detail: error.message });
  }
});

// The user read their real card balance at a gate or station machine: set the
// wallet to it and log the difference as a correction.
router.post('/correct', async (req, res) => {
  try {
    const { balance } = req.body;
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0 || balance > MAX_BALANCE) {
      return res.status(400).json({ message: `balance must be between 0 and ${MAX_BALANCE}` });
    }

    const before = await Wallet.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { currentBalance: balance, lastUpdated: new Date() } },
      { new: false }
    );
    if (!before) return res.status(404).json({ message: 'Wallet not found' });

    const diff = Math.round((balance - before.currentBalance) * 100) / 100;
    if (diff !== 0) {
      await WalletLog.create({
        userId: req.user.id,
        type: diff > 0 ? 'recharge' : 'deduction',
        amount: Math.abs(diff),
        note: 'balance_correction'
      });
    }

    return res.json({
      currentBalance: balance,
      difference: diff,
      maxBalance: MAX_BALANCE,
      remainingCapacity: Math.max(0, MAX_BALANCE - balance)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Could not correct wallet balance', detail: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    // Auto-clear logs older than retention window on each logs read.
    await WalletLog.deleteMany({
      userId: req.user.id,
      createdAt: { $lt: getAutoClearCutoff() }
    });

    const { type } = req.query;
    const filter = { userId: req.user.id };
    if (type === 'recharge' || type === 'deduction') filter.type = type;

    const logs = await WalletLog.find(filter).sort({ createdAt: -1 });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch wallet logs', detail: error.message });
  }
});

router.delete('/logs', async (req, res) => {
  try {
    const result = await WalletLog.deleteMany({ userId: req.user.id });
    return res.json({ deletedCount: result.deletedCount || 0, mode: 'manual' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not clear logs', detail: error.message });
  }
});

router.delete('/logs/auto-clear', async (req, res) => {
  try {
    const result = await WalletLog.deleteMany({
      userId: req.user.id,
      createdAt: { $lt: getAutoClearCutoff() }
    });
    return res.json({ deletedCount: result.deletedCount || 0, mode: 'auto', retentionDays: AUTO_CLEAR_DAYS });
  } catch (error) {
    return res.status(500).json({ message: 'Could not auto-clear logs', detail: error.message });
  }
});

export default router;
