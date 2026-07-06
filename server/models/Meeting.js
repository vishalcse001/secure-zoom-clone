const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// 1. Schema Definition (Database ka Structure)
const meetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true // Har meeting ki ID alag honi chahiye
  },
  password: {
    type: String,
    required: true // Har meeting ka ek password hona zaroori hai
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete feature: Meeting room 24 ghante (86400 seconds) baad khud delete ho jayega
  }
});

// 2. Mongoose Middleware (Bcrypt Encryption)
// Jab bhi hum database mein meeting save karenge, yeh function pehle chalega
// 2. Mongoose Middleware (Bcrypt Encryption)
meetingSchema.pre('save', async function () {
  // Agar password modify nahi hua hai, toh aage badho
  if (!this.isModified('password')) return;

  // Password ko secure hash mein convert karna
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// 3. Model Export Karna
module.exports = mongoose.model('Meeting', meetingSchema);