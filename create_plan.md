1. Update selection pipeline to include GROUP in supported selection so the UI sees groups (adjust `supportsInteractions`, `sendLayersToUI`).
2. Ensure UI enablement logic uses groups for hasInteractions/remove button visibility, mirroring frames/sections behavior.
3. Verify remove/clean flows work with group selections (descendant walk already handles groups); quick lint/build if needed.
