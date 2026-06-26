import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { AppBar, Typography, Container, Card, CardContent, TextField, Button, Grid, Box, Paper } from '@mui/material';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
// 1. NAYA: Screen Share ke naye Icons import kiye
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';

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
  
  // 2. NAYA STATE: Screen share status track karne ke liye
  const [isScreenSharing, setIsScreenSharing] = useState(false);

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

   // App.js ke useEffect( () => { ... }, []) ke andar jahan socket connections hain

socket.on('callEnded', () => {
  alert("The other person has left the meeting.");
  // Apna page reload kar lo taaki aap bhi home screen par aa jao
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
  // Camera aur mic ke saare tracks ko completely stop karna
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  
  // Page ko refresh kar dena taaki user wapas home screen par aa jaye
  window.location.reload();
};

  // 3. NAYA LOGIC: Screen Share on/off karna
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        // Browser se screen ka data maangna
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Chalte hue connection mein camera track ko screen track se replace karna
        if (peerRef.current) {
          const videoSender = peerRef.current.getSenders().find(sender => sender.track.kind === 'video');
          if (videoSender) videoSender.replaceTrack(screenTrack);
        }

        // Apne local video dabe mein screen dikhana
        if (myVideo.current) myVideo.current.srcObject = screenStream;
        setIsScreenSharing(true);

        // Jab user browser ke default popup se "Stop Sharing" dabaye
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
      // Wapas original camera track pakadna
      const cameraTrack = stream.getVideoTracks()[0];
      
      // Connection mein wapas camera track daal dena
      if (peerRef.current) {
        const videoSender = peerRef.current.getSenders().find(sender => sender.track.kind === 'video');
        if (videoSender) videoSender.replaceTrack(cameraTrack);
      }

      // Local video dabe mein wapas apni shakal dikhana
      if (myVideo.current) myVideo.current.srcObject = stream;
      setIsScreenSharing(false);
    }
  };

  const callUser = async () => {
    if (!idToCall) return alert("Please enter a valid Participant ID");
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
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

  const answerCall = async () => {
    setCallAccepted(true);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerRef.current = peer;
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
        <Container maxWidth="lg" sx={{ marginTop: '40px' }}>
          <Paper elevation={3} sx={{ padding: '20px', marginBottom: '30px', textAlign: 'center', borderRadius: '10px' }}>
            <Typography variant="h6">Room ID: <strong>{roomAuthId}</strong></Typography>
            <Typography variant="subtitle1" color="textSecondary">Your Participant ID: {socketId || "Connecting..."}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px' }}>
              <TextField label="Enter Remote Participant ID" variant="outlined" size="small" sx={{ width: '300px' }} value={idToCall} onChange={(e) => setIdToCall(e.target.value)} />
              <Button variant="contained" color="primary" onClick={callUser}>Initiate Connection</Button>
            </Box>
          </Paper>

          {receivingCall && !callAccepted ? (
            <Card elevation={3} sx={{ backgroundColor: '#fff3cd', marginBottom: '20px', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h6" color="warning.dark" sx={{ marginBottom: '15px' }}>Incoming Connection from: {caller}</Typography>
                <Button variant="contained" color="success" onClick={answerCall}>Accept Call</Button>
              </CardContent>
            </Card>
          ) : null}

          <Grid container spacing={4} justifyContent="center">
            {stream && (
              <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ marginBottom: '10px' }}>Local Stream</Typography>
                <video playsInline muted ref={myVideo} autoPlay style={{ width: '100%', borderRadius: '15px', border: '3px solid #333', backgroundColor: 'black', boxShadow: '0px 4px 15px rgba(0,0,0,0.2)' }} />
                
                {/* 4. NAYA LOGIC: Screen Share Button Add Kiya */}
                {/* 4. NAYA LOGIC: Screen Share Button Add Kiya */}
                <Box sx={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button variant="contained" color={isMicOn ? "success" : "error"} onClick={toggleMic} startIcon={isMicOn ? <MicIcon /> : <MicOffIcon />}>
                    {isMicOn ? 'Mute' : 'Unmute'}
                  </Button>
                  <Button variant="contained" color={isVideoOn ? "primary" : "error"} onClick={toggleVideo} startIcon={isVideoOn ? <VideocamIcon /> : <VideocamOffIcon />}>
                    {isVideoOn ? 'Camera Off' : 'Camera On'}
                  </Button>
                  <Button variant="contained" color={isScreenSharing ? "error" : "secondary"} onClick={toggleScreenShare} startIcon={isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}>
                    {isScreenSharing ? 'Stop Screen' : 'Share Screen'}
                  </Button>
                  
                  {/* 5. NAYA: End Call Button Yahan Add Hua Hai */}
                  <Button variant="contained" color="error" onClick={leaveCall}>
                    End Call
                  </Button>
                </Box>
              </Grid>
            )}

            {callAccepted && (
              <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ marginBottom: '10px' }}>Remote Stream</Typography>
                <video playsInline ref={userVideo} autoPlay style={{ width: '100%', borderRadius: '15px', border: '3px solid #1976d2', backgroundColor: 'black', boxShadow: '0px 4px 15px rgba(25, 118, 210, 0.4)' }} />
              </Grid>
            )}
          </Grid>
        </Container>
      )}
    </Box>
  );
}

export default App;