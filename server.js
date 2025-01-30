const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Multer setup for handling file uploads
const upload = multer();

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Proxy route for gesture detection
app.post("/detect", upload.single("frame"), async (req, res) => {
    try {
        const formData = new FormData();
        formData.append("frame", req.file.buffer, "frame.jpg");

        const flaskResponse = await axios.post("http://localhost:5000/detect", formData, {
            headers: formData.getHeaders(),
        });

        res.status(flaskResponse.status).send(flaskResponse.data);
    } catch (error) {
        console.error("Error proxying request:", error.message);
        res.status(500).send({ error: "Detection failed" });
    }
});

// WebRTC signaling
const connectedUsers = {};

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    connectedUsers[socket.id] = socket.id;

    // Broadcast updated user list
    io.emit("users", Object.keys(connectedUsers));

    socket.on("offer", (data) => {
        io.to(data.target).emit("offer", { from: socket.id, offer: data.offer });
    });

    socket.on("answer", (data) => {
        io.to(data.target).emit("answer", data);
    });

    socket.on("candidate", (data) => {
        io.to(data.target).emit("candidate", data);
    });

    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        delete connectedUsers[socket.id];
        io.emit("users", Object.keys(connectedUsers));
    });
});

server.listen(PORT, () => {
    console.log(`Node.js server running on http://localhost:${PORT}`);
});
