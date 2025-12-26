package main

import (
	"context"
	"encoding/binary"
	"log"
	"net"
	"sync"

	"github.com/Mentra-Community/MentraOS/cloud/packages/cloud-livekit-bridge/logger"
	pb "github.com/Mentra-Community/MentraOS/cloud/packages/cloud-livekit-bridge/proto"
)

const (
	UDP_PORT        = 8000
	PING_MAGIC      = "PING"
	MAX_PACKET_SIZE = 4096
)

// UdpAudioListener handles incoming UDP audio packets from mobile clients
type UdpAudioListener struct {
	conn          *net.UDPConn
	bridgeService *LiveKitBridgeService
	logger        *logger.BetterStackLogger
	userSessions  map[uint32]string // userIdHash -> userId
	mu            sync.RWMutex

	// For notifying TypeScript cloud of UDP pings
	pingCallbacks   map[string]func() // userId -> callback
	pingCallbacksMu sync.RWMutex

	// Stats
	packetsReceived int64
	packetsDropped  int64
	pingsReceived   int64
}

// NewUdpAudioListener creates a new UDP audio listener
func NewUdpAudioListener(bridgeService *LiveKitBridgeService, lg *logger.BetterStackLogger) (*UdpAudioListener, error) {
	addr := net.UDPAddr{Port: UDP_PORT, IP: net.ParseIP("0.0.0.0")}
	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		return nil, err
	}

	// Set read buffer size for better performance
	conn.SetReadBuffer(1024 * 1024) // 1MB buffer

	return &UdpAudioListener{
		conn:          conn,
		bridgeService: bridgeService,
		logger:        lg,
		userSessions:  make(map[uint32]string),
		pingCallbacks: make(map[string]func()),
	}, nil
}

// RegisterUser registers a user for UDP audio reception
func (l *UdpAudioListener) RegisterUser(userIdHash uint32, userId string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.userSessions[userIdHash] = userId
	log.Printf("UDP: Registered user %s with hash %d", userId, userIdHash)
	l.logger.LogInfo("UDP user registered", map[string]interface{}{
		"userId":     userId,
		"userIdHash": userIdHash,
	})
}

// UnregisterUser removes a user from UDP audio reception
func (l *UdpAudioListener) UnregisterUser(userIdHash uint32) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if userId, ok := l.userSessions[userIdHash]; ok {
		log.Printf("UDP: Unregistered user %s with hash %d", userId, userIdHash)
		delete(l.userSessions, userIdHash)
	}
}

// SetPingCallback sets the callback to be called when a UDP ping is received for a user
func (l *UdpAudioListener) SetPingCallback(userId string, callback func()) {
	l.pingCallbacksMu.Lock()
	defer l.pingCallbacksMu.Unlock()
	l.pingCallbacks[userId] = callback
}

// RemovePingCallback removes the ping callback for a user
func (l *UdpAudioListener) RemovePingCallback(userId string) {
	l.pingCallbacksMu.Lock()
	defer l.pingCallbacksMu.Unlock()
	delete(l.pingCallbacks, userId)
}

// Start begins listening for UDP packets
func (l *UdpAudioListener) Start() {
	log.Printf("✅ UDP Audio Listener started on port %d", UDP_PORT)
	l.logger.LogInfo("UDP Audio Listener started", map[string]interface{}{
		"port": UDP_PORT,
	})

	buf := make([]byte, MAX_PACKET_SIZE)

	for {
		n, remoteAddr, err := l.conn.ReadFromUDP(buf)
		if err != nil {
			// Check if connection was closed
			if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
				log.Printf("UDP: Listener stopped (connection closed)")
				return
			}
			log.Printf("UDP read error: %v", err)
			continue
		}

		if n < 6 {
			// Too small (need at least userIdHash + seq)
			l.packetsDropped++
			continue
		}

		// Parse header
		userIdHash := binary.BigEndian.Uint32(buf[0:4])
		seq := binary.BigEndian.Uint16(buf[4:6])

		// Check if this is a ping packet
		if n >= 10 && string(buf[6:10]) == PING_MAGIC {
			l.handlePing(userIdHash, remoteAddr)
			continue
		}

		// Get userId from hash
		l.mu.RLock()
		userId, ok := l.userSessions[userIdHash]
		l.mu.RUnlock()

		if !ok {
			// Unknown user, drop packet silently
			l.packetsDropped++
			continue
		}

		// Extract PCM data (after 6-byte header)
		pcmData := make([]byte, n-6)
		copy(pcmData, buf[6:n])

		l.packetsReceived++

		// Log periodically
		if l.packetsReceived%1000 == 0 {
			log.Printf("UDP: Stats - received=%d, dropped=%d, pings=%d",
				l.packetsReceived, l.packetsDropped, l.pingsReceived)
		}

		// Forward to bridge service for processing
		l.bridgeService.HandleUdpAudio(userId, seq, pcmData)
	}
}

// handlePing processes a UDP ping packet
func (l *UdpAudioListener) handlePing(userIdHash uint32, addr *net.UDPAddr) {
	l.pingsReceived++

	l.mu.RLock()
	userId, ok := l.userSessions[userIdHash]
	l.mu.RUnlock()

	if !ok {
		log.Printf("UDP: Ping from unknown userIdHash %d at %s", userIdHash, addr.String())
		return
	}

	log.Printf("UDP: Ping received from user %s (hash %d) at %s", userId, userIdHash, addr.String())
	l.logger.LogInfo("UDP ping received", map[string]interface{}{
		"userId":     userId,
		"userIdHash": userIdHash,
		"remoteAddr": addr.String(),
	})

	// Call the ping callback if registered
	l.pingCallbacksMu.RLock()
	callback, hasCallback := l.pingCallbacks[userId]
	l.pingCallbacksMu.RUnlock()

	if hasCallback && callback != nil {
		callback()
	}

	// Also notify via gRPC stream if available
	l.bridgeService.NotifyUdpPingReceived(userId)
}

// GetStats returns current statistics
func (l *UdpAudioListener) GetStats() (received, dropped, pings int64) {
	return l.packetsReceived, l.packetsDropped, l.pingsReceived
}

// Close shuts down the UDP listener
func (l *UdpAudioListener) Close() {
	if l.conn != nil {
		l.conn.Close()
	}
	log.Printf("UDP: Listener closed")
}

// HandleUdpAudio processes incoming UDP audio and forwards it to the appropriate stream
func (s *LiveKitBridgeService) HandleUdpAudio(userId string, seq uint16, pcmData []byte) {
	// Get the session for this user
	sessionVal, ok := s.sessions.Load(userId)
	if !ok {
		// No active session for this user
		return
	}

	session := sessionVal.(*RoomSession)

	// Ensure PCM data is even-length (16-bit samples)
	if len(pcmData)%2 == 1 {
		pcmData = pcmData[:len(pcmData)-1]
	}
	if len(pcmData) == 0 {
		return
	}

	// Send to the audio channel (non-blocking)
	select {
	case session.audioFromLiveKit <- pcmData:
		// Successfully queued
	default:
		// Channel full, drop packet (this is expected behavior for UDP)
	}
}

// NotifyUdpPingReceived notifies connected gRPC clients that a UDP ping was received
func (s *LiveKitBridgeService) NotifyUdpPingReceived(userId string) {
	// Broadcast to all subscribed streams
	s.broadcastUdpPing(userId)
}

// RegisterUdpUser handles the gRPC call to register a user for UDP audio
func (s *LiveKitBridgeService) RegisterUdpUser(
	ctx context.Context,
	req *pb.RegisterUdpUserRequest,
) (*pb.RegisterUdpUserResponse, error) {
	lg := s.createLogger(req.UserId, "", "udp-audio")

	log.Printf("RegisterUdpUser: userId=%s, hash=%d", req.UserId, req.UserIdHash)
	lg.Info("RegisterUdpUser request", logger.LogEntry{
		Extra: map[string]interface{}{
			"userIdHash": req.UserIdHash,
		},
	})

	if s.udpListener != nil {
		s.udpListener.RegisterUser(req.UserIdHash, req.UserId)
		return &pb.RegisterUdpUserResponse{Success: true}, nil
	}

	lg.Warn("UDP listener not available", logger.LogEntry{})
	return &pb.RegisterUdpUserResponse{
		Success: false,
		Error:   "UDP listener not available",
	}, nil
}

// UnregisterUdpUser handles the gRPC call to unregister a user from UDP audio
func (s *LiveKitBridgeService) UnregisterUdpUser(
	ctx context.Context,
	req *pb.UnregisterUdpUserRequest,
) (*pb.UnregisterUdpUserResponse, error) {
	lg := s.createLogger(req.UserId, "", "udp-audio")

	log.Printf("UnregisterUdpUser: userId=%s, hash=%d", req.UserId, req.UserIdHash)
	lg.Info("UnregisterUdpUser request", logger.LogEntry{
		Extra: map[string]interface{}{
			"userIdHash": req.UserIdHash,
		},
	})

	if s.udpListener != nil {
		s.udpListener.UnregisterUser(req.UserIdHash)
	}

	return &pb.UnregisterUdpUserResponse{Success: true}, nil
}

// SubscribeUdpPings handles the gRPC streaming call for UDP ping notifications
func (s *LiveKitBridgeService) SubscribeUdpPings(
	req *pb.SubscribeUdpPingsRequest,
	stream pb.LiveKitBridge_SubscribeUdpPingsServer,
) error {
	lg := s.createLogger("", "", "udp-audio")
	lg.Info("SubscribeUdpPings started", logger.LogEntry{})

	// Create a channel for ping notifications
	pingChan := make(chan string, 100)

	// Register this stream to receive ping notifications
	s.mu.Lock()
	if s.udpPingStreams == nil {
		s.udpPingStreams = make([]chan string, 0)
	}
	s.udpPingStreams = append(s.udpPingStreams, pingChan)
	s.mu.Unlock()

	// Cleanup on exit
	defer func() {
		s.mu.Lock()
		for i, ch := range s.udpPingStreams {
			if ch == pingChan {
				s.udpPingStreams = append(s.udpPingStreams[:i], s.udpPingStreams[i+1:]...)
				break
			}
		}
		s.mu.Unlock()
		close(pingChan)
	}()

	// Send ping notifications to the client
	for {
		select {
		case userId := <-pingChan:
			if err := stream.Send(&pb.UdpPingNotification{UserId: userId}); err != nil {
				lg.Error("Failed to send UDP ping notification", err, logger.LogEntry{})
				return err
			}
		case <-stream.Context().Done():
			lg.Info("SubscribeUdpPings stream closed", logger.LogEntry{})
			return nil
		}
	}
}

// broadcastUdpPing sends a ping notification to all subscribed streams
func (s *LiveKitBridgeService) broadcastUdpPing(userId string) {
	s.mu.RLock()
	streams := s.udpPingStreams
	s.mu.RUnlock()

	for _, ch := range streams {
		select {
		case ch <- userId:
		default:
			// Channel full, skip
		}
	}
}

