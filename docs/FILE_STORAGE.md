
# Private file storage

Phase 06 uses the existing persistent upload volume. New task files live in a feature directory beneath `UPLOAD_DIR`, outside all frontend-served directories. Private APIs use random UUID storage keys and keep storage keys, checksums and host paths out of client responses. The original normalized filename is metadata. The storage layer denies path separators, non-generated keys and symbolic links, verifies the real storage directory, writes with exclusive creation, and never treats the supplied name as a path.

## Allowed files and limits

The Phase 06 provisional allowlist is UTF-8 `.txt` and validated non-interlaced `.png`. Text rejects binary controls and recognized active markup or executable signatures. PNG inputs must have valid structure, checksums and bounded raster expansion. Other document/image formats, archives, executables and source files are outside this initial allowlist. Coding projects may be submitted as repository links. The server stores links and never retrieves or runs their targets. Curricula support link resources and task records support file resources.

Defaults are five attachments per record and five MiB per file. Set `TASK_MAX_ATTACHMENTS` to 1–20 and `TASK_MAX_FILE_SIZE_MB` to 1–10. The effective file size is also capped by `MAX_UPLOAD_SIZE_MB`. Uploads are individually bounded at the HTTP parser, with a stricter upload rate limit. Downloads stream with a private, no-store attachment response and MIME sniffing disabled. Use the binary endpoints and required attachment-name and revision headers in [OpenAPI](API.md#phase-06-tasks-learning-and-performance).

## Authorization and failures

Task resources can be added to the current draft by authorized managers. Intern submissions can receive attachments on the current writable draft. The download route rechecks the owning task or submission. An intern can download authorized own attachments and currently released task resources. A scoped technical reviewer can download submitted work, while HR performance access alone does not permit private downloads. Authentication is required on every download.

File creation precedes the metadata commit and compensates after a verified rollback. An uncertain commit retains the file until database status can be established. Failed writes clean up only the new generated path. No upload failure removes an earlier file or other volume data. An abrupt process loss can leave an unreferenced UUID file. A future operator reconciliation must inspect metadata and snapshot the volume before taking any action. No periodic deletion or global sweep runs in Phase 06.
