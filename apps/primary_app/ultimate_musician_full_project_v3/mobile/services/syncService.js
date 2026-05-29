/**
 * syncService.js (v2 - Jitter Mitigation)
 * Implements low-latency sync between Admin/Musician apps.
 */

import { API_BASE } from '../data/api';

class SyncService {
  constructor() {
    this.ws = null;
    this.latency = 0;
    this.lastServerTime = 0;
    this.offset = 0;
  }

  connect(userId) {
    const wsUrl = API_BASE.replace('http', 'ws') + `/sync/${userId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'ping') {
        this.calculateLatency(data.serverTime);
      }

      if (data.type === 'transport_jump') {
        this.handleTransportJump(data);
      }
    };
  }

  calculateLatency(serverTime) {
    const now = Date.now();
    this.latency = (now - serverTime) / 2;
    this.offset = serverTime - now + this.latency;
    
    // Auto-reply with pong to keep connection alive and refine latency
    this.send({ type: 'pong', clientTime: now });
  }

  handleTransportJump(data) {
    // Compensate for network jitter
    // If the server says jump to 1000ms, and our latency is 50ms, 
    // we should actually jump to 1050ms to be in sync.
    const compensatedPosition = data.positionMs + this.latency;
    
    console.log(`[Sync] Jumping to ${compensatedPosition}ms (Lat: ${this.latency}ms)`);
    
    // Trigger local audio engine jump
    // audioEngine.jumpTo(compensatedPosition);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export default new SyncService();
