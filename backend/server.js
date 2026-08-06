const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const auctionHandlers = require('./socket/auctionHandlers');
const apiRoutes = require('./routes/api');

// Connect to MongoDB
connectDB();

const app = express();
app.use(cors()); // what is cors -- it is used to allow the frontend to make requests to the backend
app.use(express.json()); 

// Mount REST API
app.use('/api', apiRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('io', io);

// Basic route for testing
app.get('/', (req, res) => {
    res.send('MPFK BCL 5.0 Auction Backend Running');
});

// Initialize Socket connection
io.on('connection', (socket) => {
    auctionHandlers(io, socket);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
