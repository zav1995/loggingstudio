# Logging Studio

Local-first MVP of ScorePlay's Logging Studio. Frame-accurate timecoded logging on top of HLS video, with manual hotkey logging and pluggable XML/JSON sidecar ingestion.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Agent context: [`AGENTS.md`](AGENTS.md)

## Run it

```bash
docker compose up --build
```

Then open http://localhost:5173.

The first launch will prompt for a `media_id` and `hls_url` to load.