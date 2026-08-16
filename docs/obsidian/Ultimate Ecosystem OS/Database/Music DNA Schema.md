# Music DNA Schema

```sql
-- ASSETS: The core music entities
CREATE TABLE songs (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  bpm FLOAT,
  waveform_json JSONB
);

-- MIDI: Hardware telemetry
CREATE TABLE midi_mappings (
  id UUID PRIMARY KEY,
  device_type VARCHAR(50),
  command_map JSONB
);

-- TELEMETRY: Real-time status
CREATE TABLE system_heartbeats (
  machine_id UUID,
  platform VARCHAR(20),
  sync_status VARCHAR(20),
  last_ping TIMESTAMP DEFAULT NOW()
);
```
