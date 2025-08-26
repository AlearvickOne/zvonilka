package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	Key  string
	Conn *websocket.Conn
}

type Server struct {
	clients map[string]*Client
	mu      sync.Mutex
}

func NewServer() *Server {
	return &Server{
		clients: make(map[string]*Client),
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	var userKey string

	for {
		var msg map[string]interface{}
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("ReadJSON error:", err)
			s.removeClient(userKey)
			break
		}

		action, _ := msg["action"].(string)

		switch action {
		case "register":
			key, _ := msg["key"].(string)
			userKey = key
			s.addClient(key, conn)
			log.Printf("User registered: %s", key)

		case "call":
			to, _ := msg["to"].(string)
			if c := s.getClient(to); c != nil {
				c.Conn.WriteJSON(map[string]interface{}{
					"action": "incoming_call",
					"from":   userKey,
					"signal": msg["signal"],
				})
			}

		case "answer":
			to, _ := msg["to"].(string)
			if c := s.getClient(to); c != nil {
				c.Conn.WriteJSON(map[string]interface{}{
					"action": "call_answer",
					"from":   userKey,
					"signal": msg["signal"],
				})
			}

		case "ice":
			to, _ := msg["to"].(string)
			if c := s.getClient(to); c != nil {
				c.Conn.WriteJSON(map[string]interface{}{
					"action":    "ice",
					"from":      userKey,
					"candidate": msg["candidate"],
				})
			}

		case "bye":
			to, _ := msg["to"].(string)
			if c := s.getClient(to); c != nil {
				c.Conn.WriteJSON(map[string]interface{}{
					"action": "call_ended",
					"from":   userKey,
				})
			}
		}
	}
}

func (s *Server) addClient(key string, conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[key] = &Client{Key: key, Conn: conn}
}

func (s *Server) removeClient(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, key)
}

func (s *Server) getClient(key string) *Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.clients[key]
}

func main() {
	server := NewServer()
	http.HandleFunc("/ws", server.handleWS)

	log.Println("Server listening on :80")
	log.Fatal(http.ListenAndServe("0.0.0.0:80", nil))
}
