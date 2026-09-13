# Warrior Hub Mobile v0.3.1

- Main state sync now uses conflict-safe per-device files in `warrior-hub-sync-devices/`.
- The old `warrior-hub-sync.json` is read as a legacy migration source but Mobile no longer overwrites it.
- Drawing notes remain in their separate IndexedDB + immutable OneDrive revision system.
