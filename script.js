const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const userList = document.getElementById("userList");
const startASLDetection = document.getElementById("startASLDetection");
const stopASLDetection = document.getElementById("stopASLDetection");
const aslCanvas = document.getElementById("aslCanvas");
const aslContext = aslCanvas.getContext("2d");

let localStream;
let peerConnection;
let currentPeer = null;
let detectASL = false;

const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Get access to the webcam
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localStream = stream;
        localVideo.srcObject = stream;
    })
    .catch((error) => console.error("Error accessing media devices:", error));

// WebRTC signaling
socket.on("offer", async (data) => {
    peerConnection = createPeerConnection(data.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", { target: data.from, answer });
});

socket.on("answer", (data) => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on("candidate", (data) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
});

socket.on("users", (users) => {
    userList.innerHTML = "";
    users.forEach((user) => {
        if (user !== socket.id) {
            const listItem = document.createElement("li");
            listItem.textContent = user;
            listItem.addEventListener("click", () => initiateCall(user));
            userList.appendChild(listItem);
        }
    });
});

socket.emit("new-user");

// Create PeerConnection and initiate call
async function initiateCall(target) {
    currentPeer = target;
    peerConnection = createPeerConnection(target);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", { target, offer });
}

function createPeerConnection(target) {
    const pc = new RTCPeerConnection(config);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("candidate", { target, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    return pc;
}

// Gesture detection
startASLDetection.addEventListener("click", () => {
    detectASL = true;
    aslCanvas.style.display = "block";
    startASLDetection.disabled = true;
    stopASLDetection.disabled = false;
    processASL();
});

stopASLDetection.addEventListener("click", () => {
    detectASL = false;
    aslCanvas.style.display = "none";
    startASLDetection.disabled = false;
    stopASLDetection.disabled = true;
});

function processASL() {
    if (!detectASL) return;

    aslCanvas.width = localVideo.videoWidth;
    aslCanvas.height = localVideo.videoHeight;
    aslContext.drawImage(localVideo, 0, 0, aslCanvas.width, aslCanvas.height);

    aslCanvas.toBlob((blob) => {
        const formData = new FormData();
        formData.append("frame", blob, "frame.jpg");

        fetch("/detect", {
            method: "POST",
            body: formData,
        })
            .then((response) => response.json())
            .then((detections) => {
                aslContext.clearRect(0, 0, aslCanvas.width, aslCanvas.height);
                aslContext.drawImage(localVideo, 0, 0, aslCanvas.width, aslCanvas.height);

                detections.forEach((detection) => {
                    aslContext.strokeStyle = "red";
                    aslContext.lineWidth = 2;
                    aslContext.strokeRect(
                        detection.x1,
                        detection.y1,
                        detection.x2 - detection.x1,
                        detection.y2 - detection.y1
                    );
                    aslContext.fillStyle = "red";
                    aslContext.font = "16px Arial";
                    aslContext.fillText(
                        `${detection.label} (${detection.confidence.toFixed(2)})`,
                        detection.x1,
                        detection.y1 - 5
                    );
                });
            })
            .catch((error) => console.error("Error:", error));
    });

    setTimeout(processASL, 300);
}
