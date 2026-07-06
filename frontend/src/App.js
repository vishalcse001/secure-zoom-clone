import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { AppBar, Typography, Container, Card, CardContent, TextField, Button, Grid, Box, Paper, Divider } from '@mui/material';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import CameraswitchIcon from '@mui/icons-material/Cameraswitch';
import SendIcon from '@mui/icons-material/Send'; // 1. Chat send button ke liye naya icon

const socket = io('https://secure-zoom-clone.onrender.com');

function App() {
  const [inMeeting, setInMeeting] = useState(false);
  const [roomAuthId, setRoomAuthId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [socketId, setSocketId] = useState('');
  const [stream, setStream] = useState(null);
  const [idToCall, setIdToCall] = useState('');
  const [callAccepted, setCallAccepted] = useState(false);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState('');
  const [callerSignal, setCallerSignal] = useState(null);
  
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFrontCam, setIsFrontCam] = useState(true);

  // 2. CHAT SYSTEM STATES: Messages aur input box ko track karne ke liye
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const dataChannelRef = useRef(null); // WebRTC Data Channel ka reference

  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const peerRef = useRef(null);

  const handleCreateMeeting = async () => {
    try {
      const response = await axios.post('https://secure-zoom-clone.onrender.com/api/meeting/create', { meetingId: roomAuthId, password: roomPassword });
      alert(response.data.message); 
      setInMeeting(true); 
      startMedia(); 
    } catch (error) {
      setErrorMsg(error.response?.data?.error || "Error creating meeting");
    }
  };

  const handleJoinMeeting = async () => {
    try {
      const response = await axios.post('http://127.0.0.1:5000/api/meeting/join', { meetingId: roomAuthId, password: roomPassword });
      alert(response.data.message);
      setInMeeting(true); 
      startMedia(); 
    } catch (error) {
      setErrorMsg(error.response?.data?.error || "Invalid Credentials");
    }
  };

  const startMedia = () => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => setStream(currentStream))
      .catch((error) => console.error("Media error:", error));
  };

  useEffect(() => {
    if (socket.connected) setSocketId(socket.id);
    const handleConnect = () => setSocketId(socket.id);
    socket.on('connect', handleConnect);

    socket.on('callUser', (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
    });

    socket.on('callEnded', () => {
      alert("The other person has left the meeting.");
      window.location.reload();
    });

    socket.on('callAccepted', (signal) => {
      setCallAccepted(true);
      if (peerRef.current) peerRef.current.setRemoteDescription(new RTCSessionDescription(signal));
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('callUser');
      socket.off('callAccepted');
    };
  }, []);

  useEffect(() => {
    if (stream && myVideo.current) myVideo.current.srcObject = stream;
  }, [stream]);

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
    }
  };

  const leaveCall = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    window.location.reload();
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        if (peerRef.current) {
          const videoSender = peerRef.current.getSenders().find(sender => sender.track.kind === 'video');
          if (videoSender) videoSender.replaceTrack(screenTrack);
        }

        if (myVideo.current) myVideo.current.srcObject = screenStream;
        setIsScreenSharing(true);

        screenTrack.onended = () => stopScreenSharing();
      } catch (error) {
        console.error("Screen sharing error:", error);
      }
    } else {
      stopScreenSharing();
    }
  };

  const stopScreenSharing = () => {
    if (stream) {
      const cameraTrack = stream.getVideoTracks()[0];
      if (peerRef.current) {
        const videoSender = peerRef.current.getSenders().find(sender => sender.track.kind === 'video');
        if (videoSender) videoSender.replaceTrack(cameraTrack);
      }
      if (myVideo.current) myVideo.current.srcObject = stream;
      setIsScreenSharing(false);
    }
  };

  const flipCamera = async () => {
    try {
      const newFacingMode = isFrontCam ? "environment" : "user";
      
      // 1. Sabse pehle chalte hue video track ko STOP karo (Taaki phone ka hardware free ho jaye)
      if (stream) {
        const oldVideoTrack = stream.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();
      }

      // 2. Ab naya camera maango (Dhyan de: yahan sirf video maang rahe hain, audio nahi)
      const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: newFacingMode } 
      });
      const newVideoTrack = newVideoStream.getVideoTracks()[0];

      // 3. Purane chalte hue Audio aur naye Video ko mila kar ek naya Stream banao
      const currentAudioTrack = stream.getAudioTracks()[0];
      const combinedStream = new MediaStream([newVideoTrack, currentAudioTrack]);

      // 4. Apni local screen par update karo
      if (myVideo.current) {
        myVideo.current.srcObject = combinedStream;
      }

      // 5. WebRTC connection mein dusre bande ko naya video bhejo
      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }

      // 6. Naye stream ko state mein save karo taaki Mute/Camera off buttons sahi se chalte rahein
      setStream(combinedStream);
      setIsFrontCam(!isFrontCam);

    } catch (error) {
      console.error("Camera flip error:", error);
      // Ab hum original error dikhayenge taaki exact pata chale agar kuch issue ho
      alert("Error flipping camera: " + error.message); 
    }
  };

  // 3. SEND MESSAGE FUNCTION
  const handleSendMessage = () => {
    if (message.trim() === '') return;
    
    // Agar connection ready hai, toh dusre bande ko WebRTC se message bhejo
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(message);
      
      // Khud ki screen par bhi message show karo
      setChatMessages((prev) => [...prev, { sender: 'You', text: message }]);
      setMessage(''); // Input box khali kar do
    } else {
      alert("Please wait for the call to connect before sending messages.");
    }
  };

  // CALL INITIATOR SIDE
  const callUser = async () => {
    if (!idToCall) return alert("Please enter a valid Participant ID");
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
    
    // 4. DATA CHANNEL CREATE KARNA (Chat ke liye)
    const dc = peer.createDataChannel('chat');
    dataChannelRef.current = dc;
    dc.onmessage = (event) => {
      setChatMessages((prev) => [...prev, { sender: 'Remote', text: event.data }]);
    };
    
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      setCallAccepted(true);
      setTimeout(() => { if (userVideo.current) userVideo.current.srcObject = event.streams[0]; }, 100);
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    
    peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === 'complete') {
            socket.emit('callUser', { userToCall: idToCall, signalData: peer.localDescription, from: socketId, name: 'Initiator' });
        }
    };
    setTimeout(() => {
        if (peer.iceGatheringState !== 'complete') {
             socket.emit('callUser', { userToCall: idToCall, signalData: peer.localDescription, from: socketId, name: 'Initiator' });
        }
    }, 2000);
  };

  // CALL RECEIVER SIDE
  const answerCall = async () => {
    setCallAccepted(true);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
    
    // 5. DATA CHANNEL RECEIVE KARNA (Chat ke liye)
    peer.ondatachannel = (event) => {
      dataChannelRef.current = event.channel;
      event.channel.onmessage = (e) => {
        setChatMessages((prev) => [...prev, { sender: 'Remote', text: e.data }]);
      };
    };

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      setTimeout(() => { if (userVideo.current) userVideo.current.srcObject = event.streams[0]; }, 100);
    };

    await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    peer.onicegatheringstatechange = () => {
         if (peer.iceGatheringState === 'complete') {
             socket.emit('answerCall', { signal: peer.localDescription, to: caller });
         }
    };
     setTimeout(() => {
        if (peer.iceGatheringState !== 'complete') {
             socket.emit('answerCall', { signal: peer.localDescription, to: caller });
        }
    }, 2000);
  };

  return (
    <Box sx={{ flexGrow: 1, backgroundColor: '#f0f2f5', minHeight: '100vh', paddingBottom: '50px' }}>
      <AppBar position="static" color="primary" sx={{ padding: '10px 0' }}>
        <Typography variant="h4" component="div" sx={{ flexGrow: 1, textAlign: 'center', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <VideoCallIcon fontSize="large" /> Secure Zoom Clone
        </Typography>
      </AppBar>

      {!inMeeting ? (
        <Container maxWidth="sm" sx={{ marginTop: '80px' }}>
          {/* Pehle jaisa Join/Create page */}
          <Card elevation={4} sx={{ borderRadius: '15px' }}>
            <CardContent sx={{ padding: '40px', textAlign: 'center' }}>
              <Typography variant="h5" sx={{ marginBottom: '30px', fontWeight: 'bold', color: '#333' }}>
                Join or Create a Meeting
              </Typography>
              <TextField label="Meeting ID" variant="outlined" fullWidth sx={{ marginBottom: '20px' }} value={roomAuthId} onChange={(e) => setRoomAuthId(e.target.value)} />
              <TextField label="Password" type="password" variant="outlined" fullWidth sx={{ marginBottom: '20px' }} value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
              {errorMsg && <Typography color="error" sx={{ marginBottom: '15px' }}>{errorMsg}</Typography>}
              <Grid container spacing={2}>
                <Grid item xs={6}><Button variant="contained" color="success" fullWidth size="large" onClick={handleCreateMeeting}>Create Room</Button></Grid>
                <Grid item xs={6}><Button variant="contained" color="primary" fullWidth size="large" onClick={handleJoinMeeting}>Join Room</Button></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Container>
      ) : (
        <Container maxWidth="xl" sx={{ marginTop: '20px' }}>
          <Paper elevation={3} sx={{ padding: '15px', marginBottom: '20px', textAlign: 'center', borderRadius: '10px', maxWidth: '600px', margin: '0 auto 20px' }}>
            <Typography variant="subtitle1" color="textSecondary">Your Participant ID: <strong>{socketId || "Connecting..."}</strong></Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px' }}>
              <TextField label="Enter Remote Participant ID" variant="outlined" size="small" sx={{ width: '300px' }} value={idToCall} onChange={(e) => setIdToCall(e.target.value)} />
              <Button variant="contained" color="primary" onClick={callUser}>Connect</Button>
            </Box>
          </Paper>

          {receivingCall && !callAccepted ? (
            <Card elevation={3} sx={{ backgroundColor: '#fff3cd', marginBottom: '20px', textAlign: 'center', maxWidth: '500px', margin: '0 auto 20px' }}>
              <CardContent>
                <Typography variant="h6" color="warning.dark" sx={{ marginBottom: '15px' }}>Incoming Connection from: {caller}</Typography>
                <Button variant="contained" color="success" onClick={answerCall}>Accept Call</Button>
              </CardContent>
            </Card>
          ) : null}

          {/* 6. MAIN LAYOUT: Left Side Video, Right Side Chat */}
          <Grid container spacing={2}>
            
            {/* VIDEO SECTION (Left part) */}
            <Grid item xs={12} md={callAccepted ? 8 : 12}>
              <Grid container spacing={3} justifyContent="center">
                {stream && (
                  <Grid item xs={12} md={callAccepted ? 6 : 12} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ marginBottom: '10px' }}>You</Typography>
                    {/* Yahan teri photo ko seedha (mirror) karne ke liye scaleX(-1) lagaya gaya hai */}
                    <video playsInline muted ref={myVideo} autoPlay style={{ width: '100%', borderRadius: '15px', border: '3px solid #333', backgroundColor: 'black', boxShadow: '0px 4px 15px rgba(0,0,0,0.2)', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    
                    <Box sx={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button variant="contained" color={isMicOn ? "success" : "error"} onClick={toggleMic} startIcon={isMicOn ? <MicIcon /> : <MicOffIcon />}>{isMicOn ? 'Mute' : 'Unmute'}</Button>
                      <Button variant="contained" color={isVideoOn ? "primary" : "error"} onClick={toggleVideo} startIcon={isVideoOn ? <VideocamIcon /> : <VideocamOffIcon />}>{isVideoOn ? 'Cam Off' : 'Cam On'}</Button>
                      <Button variant="contained" color="info" onClick={flipCamera} startIcon={<CameraswitchIcon />}>Flip</Button>
                      <Button variant="contained" color={isScreenSharing ? "error" : "secondary"} onClick={toggleScreenShare} startIcon={isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}>{isScreenSharing ? 'Stop Share' : 'Share'}</Button>
                      <Button variant="contained" color="error" onClick={leaveCall}>End</Button>
                    </Box>
                  </Grid>
                )}

                {callAccepted && (
                  <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ marginBottom: '10px' }}>Remote Peer</Typography>
                    <video playsInline ref={userVideo} autoPlay style={{ width: '100%', borderRadius: '15px', border: '3px solid #1976d2', backgroundColor: 'black', boxShadow: '0px 4px 15px rgba(25, 118, 210, 0.4)', objectFit: 'cover' }} />
                  </Grid>
                )}
              </Grid>
            </Grid>

            {/* CHAT SECTION (Right part - Jab call accept ho jaye tab dikhega) */}
            {callAccepted && (
              <Grid item xs={12} md={4}>
                <Paper elevation={4} sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px', borderRadius: '15px', overflow: 'hidden' }}>
                  <Box sx={{ backgroundColor: '#1976d2', color: 'white', padding: '15px', textAlign: 'center' }}>
                    <Typography variant="h6">Live Chat</Typography>
                  </Box>
                  
                  {/* Messages Dikhane wali jagah */}
                  <Box sx={{ flexGrow: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {chatMessages.length === 0 ? (
                      <Typography color="textSecondary" align="center" sx={{ marginTop: '20px' }}>No messages yet. Say hi!</Typography>
                    ) : (
                      chatMessages.map((msg, index) => (
                        <Box key={index} sx={{ alignSelf: msg.sender === 'You' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', marginBottom: '2px', textAlign: msg.sender === 'You' ? 'right' : 'left' }}>
                            {msg.sender}
                          </Typography>
                          <Typography sx={{ backgroundColor: msg.sender === 'You' ? '#1976d2' : '#e0e0e0', color: msg.sender === 'You' ? 'white' : 'black', padding: '8px 12px', borderRadius: '15px', display: 'inline-block', wordBreak: 'break-word' }}>
                            {msg.text}
                          </Typography>
                        </Box>
                      ))
                    )}
                  </Box>

                  <Divider />
                  
                  {/* Message Likhne wali jagah */}
                  <Box sx={{ display: 'flex', padding: '10px', backgroundColor: 'white' }}>
                    <TextField 
                      fullWidth 
                      size="small" 
                      variant="outlined" 
                      placeholder="Type a message..." 
                      value={message} 
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} 
                    />
                    <Button variant="contained" color="primary" onClick={handleSendMessage} sx={{ marginLeft: '10px' }} endIcon={<SendIcon />}>
                      Send
                    </Button>
                  </Box>
                </Paper>
              </Grid>
            )}

          </Grid>
        </Container>
      )}
    </Box>
  );
}

export default App;