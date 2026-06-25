const express = require('express'); 
const http = require('http');       
const cors = require('cors');       
const { Server } = require('socket.io'); 
const mongoose = require('mongoose'); 
const bcrypt = require('bcrypt');     // NAYA: Bcrypt import kiya password compare karne ke liye
const Meeting = require('./models/Meeting'); // NAYA: Apna banaya hua model import kiya
require('dotenv').config();           

const app = express();              
const server = http.createServer(app); 

app.use(cors({origin:"*"}));
// NAYA: Express ko JSON data samajhne ke liye allow karna
app.use(express.json()); 

const DB_URI = process.env.MONGO_URI;

mongoose.connect(DB_URI)
  .then(() => console.log('MongoDB is securely connected!'))
  .catch((err) => console.error('MongoDB connection error:', err));


// ==========================================
// API ROUTES (NAYA LOGIC)
// ==========================================

// 1. Nayi Meeting Create Karne Ka Route
app.post('/api/meeting/create', async (req, res) => {
  try {
    const { meetingId, password } = req.body;
    
    // Check karna ki ID pehle se toh nahi hai
    const existingMeeting = await Meeting.findOne({ meetingId });
    if (existingMeeting) {
      return res.status(400).json({ error: "Meeting ID already exists. Please try another." });
    }

    // Nayi meeting database mein save karna
    const newMeeting = new Meeting({ meetingId, password });
    await newMeeting.save();

    res.status(201).json({ message: "Meeting room created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
    console.log("Create Room Error",error);
  }
});

// 2. Meeting Join Karne Ka Route
app.post('/api/meeting/join', async (req, res) => {
  try {
    const { meetingId, password } = req.body;

    // Database mein meeting dhoondhna
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: "Invalid Meeting ID." });
    }

    // Password match karna (Bcrypt ki madad se)
    const isMatch = await bcrypt.compare(password, meeting.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect Password." });
    }

    res.status(200).json({ message: "Access Granted!" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ==========================================
// SOCKET.IO SIGNALING LOGIC
// ==========================================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('New connection established. Socket ID:', socket.id);

  socket.on('callUser', ({ userToCall, signalData, from, name }) => {
    io.to(userToCall).emit('callUser', { signal: signalData, from, name });
  });

  socket.on('answerCall', (data) => {
    io.to(data.to).emit('callAccepted', data.signal);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});