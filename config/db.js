import mongoose from 'mongoose';

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI in environment');
  await mongoose.connect(mongoUri);
};
