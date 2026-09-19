import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Wallet from '../models/Wallet.js';

const router = Router();

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET);

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    await Wallet.create({ userId: user._id, currentBalance: 0 });

    const accessToken = signToken(user);
    return res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email },
      accessToken
    });
  } catch (error) {
    return res.status(500).json({ message: 'Registration failed', detail: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = signToken(user);
    return res.json({
      user: { id: user._id, name: user.name, email: user.email },
      accessToken
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', detail: error.message });
  }
});

export default router;
