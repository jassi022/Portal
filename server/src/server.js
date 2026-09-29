import 'dotenv/config';
import mongoose from 'mongoose';
import dns from 'dns';
import app from './app.js';
dns.setServers(['8.8.8.8', '1.1.1.1']);
await mongoose.connect(process.env.MONGO_URI);
app.listen(process.env.PORT || 4000, () => console.log('API running'));
