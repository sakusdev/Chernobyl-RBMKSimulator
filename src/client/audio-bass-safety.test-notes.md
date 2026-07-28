# Audio bass regression checklist

- Existing saved audio preferences migrate once.
- Master volume is capped at 58% during migration.
- Machinery volume is capped at 28% during migration.
- Ambient volume is capped at 18% during migration.
- Oscillator sources receive a 96 Hz high-pass filter.
- Buffer sources receive an 82 Hz high-pass filter.
- Alarm and control tones remain audible after filtering.
- Audio remains disabled until a user gesture unlocks AudioContext.
