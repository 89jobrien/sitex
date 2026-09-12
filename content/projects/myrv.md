---
title: "myrv"
date: 2026-08-18
description: "A hexagonal-architecture telemetry system for a 2015 RV, reading OBD-II chassis data, house battery, and generator state through swappable manual/serial sources into an embedded sled key-value store for display and assistant queries."
taxonomies:
  tags: [observability, systems-config, systems-software]
extra:
  repo: "https://github.com/89jobrien/myrv"
  related: [project:taskit]
---

# myrv

Telemetry system for a 2015 Leprechaun 260DS RV. Reads OBD-II chassis data, house battery
state, and generator state; builds a typed snapshot for display or assistant queries.

## Architecture

Hexagonal layout — the domain model never imports adapters:

```
TelemetrySource (port)
  ├── ManualSource   crates/manual-source   TOML file, dev/field overrides
  └── ObdSource      crates/obd-source      ELM327 over serial or TCP

TelemetryStore (port)
  └── SledStore      crates/kv              embedded sled KV, chronological key encoding

core (crates/core)
  ├── domain         bounded newtypes, Measurement, TelemetrySnapshot
  ├── ports          TelemetrySource, TelemetryStore, HistoryFilter
  └── snapshot       build_snapshot — assembles TelemetrySnapshot from Vec<Measurement>
```

## Dev environment

```sh
direnv allow          # loads .envrc — sets MYRV_OBD_PORT, MYRV_DB_PATH, MYRV_MANUAL_OVERRIDE
```

Edit `.ctx/manual-override.toml` to inject measurements without real hardware. `ManualSource`
re-reads the file on every poll — no restart needed.

## Manual override format

```toml
[values]
chassis_voltage      = 12.6
chassis_rpm          = 800
chassis_speed        = 0
chassis_coolant_temp = 82.0
chassis_fuel_level   = 68.0
house_voltage        = 13.1
house_soc            = 87.0
generator_running    = false
```

Supported value types: `f64`, `i64`, `bool`, string. Key names must match the snapshot
builder's expected measurement names exactly (e.g. `generator_running`, not `gen_running`).

## Build & test

```sh
cargo xtask ci          # check + nextest + clippy (matches CI)
cargo xtask pre-commit  # fmt-check + check + clippy (fast gate)
```

## Release

```sh
cargo xtask prep 0.2.0  # bump workspace version, run ci, print next steps
cargo xtask release     # tag HEAD with workspace version and push
cargo xtask revert      # undo uncommitted version bumps
```

## License

MIT OR Apache-2.0
