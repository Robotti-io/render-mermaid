# Threat Model Review - 2026-02-25

> Method: Adam Shostack’s Four Questions (4Q) + STRIDE + OWASP mapping.
>
> Repository: yt-file-codec (Node.js CLI)

## 0. Executive summary

- Highest risk: decoding untrusted MP4s invokes an external ffmpeg process (memory safety and codec parsing exposure); treat ffmpeg as a hardened boundary and keep it updated/sandboxed. Evidence: [index.js](index.js#L261), [ffmpeg.js](ffmpeg.js#L4-L60)
- High risk: decode writes output path using attacker-controlled `originalName` from the packet; a crafted MP4 can cause path traversal and write outside `outputDir`. Evidence: [index.js](index.js#L379)
- High risk: passphrases are currently passed via CLI args (`--passphrase <text>`), which can leak via shell history, process listings, crash reports, or logs. Evidence: [index.js](index.js#L38-L48)
- Medium risk: metadata (original filename, sizes, manifest) is stored in the packet in plaintext (though embedded inside video frames); sharing the MP4 can leak filename and other attributes even without keys. Evidence: [packet.js](packet.js#L10-L28)
- Medium risk: supply-chain surface includes optional native `argon2` and optional PQ libraries loaded dynamically; a compromised dependency is a direct code execution path. Evidence: [passphrase_wrap.js](passphrase_wrap.js#L6-L9), [pq.js](pq.js#L4-L23)
- Solid: payload confidentiality and integrity are provided by AES-256-GCM; decrypt will fail on tampering without the file key. Evidence: [crypto.js](crypto.js#L3-L18)
- Solid: multiple integrity checks exist for robustness (packet CRC32, shard CRC32, RS recovery). Evidence: [packet.js](packet.js#L28-L50), [grid_rs.js](grid_rs.js#L148-L200)
- Unknown: intended threat posture (purely local/offline vs “download MP4s from internet and decode”) significantly changes required controls.

---

## 1. Scope

### In-scope components/containers

- Node.js CLI entrypoint and orchestration: [index.js](index.js#L1-L393)
- Cryptography primitives: [crypto.js](crypto.js#L3-L18)
- Packet format and CRC: [packet.js](packet.js#L4-L73)
- Key slots and passphrase/PQ wrapping: [key_slots.js](key_slots.js#L12-L79), [passphrase_wrap.js](passphrase_wrap.js#L13-L120), [pq.js](pq.js#L4-L112)
- Signature slots (Ed25519 and optional ML-DSA): [signatures.js](signatures.js#L18-L90)
- Video grid codec and shard CRC: [grid_rs.js](grid_rs.js#L128-L232)
- Reed–Solomon erasure coding: [rs_erasure.js](rs_erasure.js#L62-L109)
- Audio beacon metadata + FSK WAV: [audio_meta.js](audio_meta.js#L10-L57), [fsk.js](fsk.js#L58-L132)
- External process boundary: ffmpeg adapter: [ffmpeg.js](ffmpeg.js#L4-L60)

### Out-of-scope (not evidenced in repo)

- Any server/cloud deployment, upload to YouTube, authn/z, multi-user access control
- CI/CD hardening and publishing pipeline controls (no workflows observed under .github/workflows)

### Trust boundaries

- User shell → CLI process (untrusted args/paths)
- CLI process → external executable (ffmpeg)
- CLI process → third-party modules (optional argon2, optional PQ module)
- Local storage boundary (input MP4/file + temp files + outputs)

### Key assets (with sensitivity)

- Passphrase provided by user (Restricted)
- File key (32 bytes) used for AES-GCM (Restricted). Evidence: [index.js](index.js#L144)
- PQ secret keys used for decapsulation/signing (Restricted). Evidence: [key_slots.js](key_slots.js#L65-L78)
- Input file contents (Confidential/Restricted depending on user)
- Output MP4 (Confidential): contains ciphertext plus plaintext metadata (filename/manifest) and wrapped keys. Evidence: [packet.js](packet.js#L10-L28)
- Output recovered file (Confidential/Restricted)

---

## 2. Assumptions & Unknowns

- **ASSUMPTION:** Tool is primarily used locally/offline by a single user on their machine.
- **UNKNOWN:** Are decode inputs considered untrusted (e.g., MP4s downloaded from the internet)? Who can confirm: product owner/maintainer.
- **UNKNOWN:** Is revealing `originalName`/manifest acceptable when the MP4 is shared publicly? Who can confirm: product owner.
- **UNKNOWN:** Are users expected to run with elevated privileges (Administrator/root)? Who can confirm: maintainer.
- **UNKNOWN:** What environments matter most (Windows/macOS/Linux; corporate endpoints; sandboxes)? Who can confirm: maintainer.

---

## 3. Architecture & Data Flows (tool-validated Mermaid)

### 3.1 DFD Level 0 (Context)

```mermaid
flowchart LR
  %% DFD Level 0 (Context) for yt-file-codec
  subgraph tb_user[Trust Boundary: User shell]
    user[External Entity: User]
  end

  subgraph tb_host[Trust Boundary: Local host]
    cli[Process: yt-file-codec CLI]
    fs[(Data store: Local filesystem)]
    tmp[(Data store: OS temp directory)]
  end

  subgraph tb_ext[Trust Boundary: External code and binaries]
    ffmpeg[External Process: ffmpeg]
    pqmod[External Library: PQ module optional]
    argon2mod[External Library: argon2 optional]
  end

  user -->|"CLI args: paths, profile, passphrase, keys"| cli

  cli -->|"Read input file bytes"| fs
  cli -->|"Write output MP4"| fs
  cli -->|"Write decoded file"| fs

  cli -->|"Create temp frames and optional WAV"| tmp
  tmp -->|"Read frames and WAV"| cli

  cli -->|"Spawn child process"| ffmpeg
  ffmpeg -->|"Read and write media files"| fs
  ffmpeg -->|"Read frames and WAV"| tmp

  cli -->|"dynamic import()"| pqmod
  cli -->|"dynamic import()"| argon2mod
```

**Evidence**
- CLI encode/decode, args, temp dirs, cleanup: [index.js](index.js#L1-L259) and [index.js](index.js#L260-L393)
- External ffmpeg process spawn boundary: [ffmpeg.js](ffmpeg.js#L4-L60)
- Optional module dynamic imports: [passphrase_wrap.js](passphrase_wrap.js#L6-L9), [pq.js](pq.js#L4-L23)

### 3.2 DFD Level 1 (Subsystems / Containers)

```mermaid
flowchart LR
  %% DFD Level 1 (Subsystems) for yt-file-codec

  subgraph tb_user[Trust Boundary: User shell]
    user[External Entity: User]
  end

  subgraph tb_store[Trust Boundary: Local storage]
    ds_in[(Data store: Input file)]
    ds_in_mp4[(Data store: Input MP4)]
    ds_out_mp4[(Data store: Output MP4)]
    ds_out_dir[(Data store: Output directory)]
    ds_tmp_frames[(Data store: Temp PNG frames)]
    ds_tmp_wav[(Data store: Temp WAV audio)]
  end

  subgraph tb_cli[Trust Boundary: Node.js CLI process]
    subgraph enc[Encode]
      p_read[Read input]
      p_comp[Compress optional]
      p_key[File key]
      p_enc[Encrypt AES-256-GCM]
      p_slots[Key slots]
      p_sign[Signature slots optional]
      p_pkt[Build packet]
      p_fec[RS protect]
      p_frames[Render frames]
      p_ameta[Audio meta]
      p_fsk[FSK WAV optional]
      p_mux[Mux MP4]
    end

    subgraph dec[Decode]
      p_extract[Extract frames and audio]
      p_ahint[Audio hints optional]
      p_shards[Decode shards]
      p_recover[RS recover]
      p_parse[Parse packet]
      p_unwrap[Unwrap file key]
      p_verify[Verify signatures optional]
      p_dec[Decrypt AES-256-GCM]
      p_decomp[Decompress]
      p_write[Write output]
    end
  end

  subgraph tb_ext[Trust Boundary: External code and binaries]
    ffmpeg[External Process: ffmpeg]
    pqmod[External Library: PQ module optional]
    argon2mod[External Library: argon2 optional]
  end

  %% Encode flows
  user -->|"encode args"| p_read
  ds_in -->|"bytes"| p_read
  p_read --> p_comp
  p_comp -->|"prepared bytes"| p_enc
  p_key -->|"fileKey"| p_enc
  p_key -->|"fileKey"| p_slots
  p_enc -->|"nonce tag ciphertext"| p_pkt
  p_slots -->|"keySlotsBlob"| p_pkt
  p_sign -->|"signatureSlotsBlob"| p_pkt
  p_slots -->|"KDF argon2id optional"| argon2mod
  p_slots -->|"ML-KEM encapsulate optional"| pqmod
  p_sign -->|"ML-DSA sign optional"| pqmod
  p_pkt --> p_fec
  p_fec --> p_frames
  p_frames -->|"write PNG"| ds_tmp_frames
  p_ameta --> p_fsk
  p_fsk -->|"write WAV"| ds_tmp_wav
  p_mux -->|"spawn"| ffmpeg
  ds_tmp_frames -->|"read PNG"| ffmpeg
  ds_tmp_wav -->|"read WAV"| ffmpeg
  ffmpeg -->|"write MP4"| ds_out_mp4

  %% Decode flows
  user -->|"decode args"| p_extract
  ds_in_mp4 -->|"read MP4"| p_extract
  p_extract -->|"spawn"| ffmpeg
  ffmpeg -->|"write PNG"| ds_tmp_frames
  ffmpeg -->|"write WAV optional"| ds_tmp_wav
  ds_tmp_wav --> p_ahint
  ds_tmp_frames --> p_shards
  p_shards --> p_recover
  p_recover --> p_parse
  p_parse --> p_unwrap
  p_unwrap -->|"scrypt or argon2id"| argon2mod
  p_unwrap -->|"ML-KEM decapsulate optional"| pqmod
  p_verify -->|"ML-DSA verify optional"| pqmod
  p_parse --> p_verify
  p_parse --> p_dec
  p_unwrap -->|"fileKey"| p_dec
  p_dec -->|"plaintext"| p_decomp
  p_decomp --> p_write
  p_write -->|"write file"| ds_out_dir
```

**Evidence**
- Encode pipeline orchestration and module calls: [index.js](index.js#L114-L245)
- Decode pipeline orchestration and module calls: [index.js](index.js#L261-L385)
- Packet + CRC: [packet.js](packet.js#L10-L73)
- Shard decode + shard CRC + majority vote: [grid_rs.js](grid_rs.js#L128-L232)
- RS protect/recover: [rs_erasure.js](rs_erasure.js#L62-L109)
- Key slots and PQ wrapping: [key_slots.js](key_slots.js#L12-L79)

### 3.3 Trust boundary view

```mermaid
flowchart LR
  %% Trust boundary view (explicit boundary crossings)

  subgraph b_untrusted[Trust Boundary: Untrusted inputs]
    cli_args[Input: CLI args]
    input_file[Input: file to encode]
    input_mp4[Input: MP4 to decode]
  end

  subgraph b_cli[Trust Boundary: yt-file-codec process]
    cli[Process: Node.js CLI]
  end

  subgraph b_local[Trust Boundary: Local storage]
    temp_files[(Temp frames and WAV)]
    output_mp4[(Output MP4)]
    output_file[(Recovered file)]
  end

  subgraph b_ext_exec[Trust Boundary: External executable]
    ffmpeg[External Process: ffmpeg]
  end

  subgraph b_supply[Trust Boundary: Third-party modules]
    argon2mod[Module: argon2 optional]
    pqmod[Module: PQ optional]
    png_wav[Modules: pngjs and wav codec]
  end

  cli_args -->|"parsed in process"| cli
  input_file -->|"read bytes"| cli
  input_mp4 -->|"passed to ffmpeg"| cli

  cli -->|"writes"| temp_files
  cli -->|"writes"| output_mp4
  cli -->|"writes"| output_file

  cli -->|"spawn and args"| ffmpeg
  ffmpeg -->|"reads and writes"| temp_files
  ffmpeg -->|"reads and writes"| output_mp4

  cli -->|"dynamic import"| argon2mod
  cli -->|"dynamic import"| pqmod
  cli -->|"require/import"| png_wav
```

**Evidence**
- ffmpeg spawn boundary: [ffmpeg.js](ffmpeg.js#L8-L60)
- Optional dependency loading: [passphrase_wrap.js](passphrase_wrap.js#L6-L9), [pq.js](pq.js#L4-L23)

---

## 4. Key Flows (ranked)

### Flow F1 — Encode (file → MP4)

- Description: reads an input file, optionally compresses, encrypts with AES-256-GCM, wraps file key into one or more key slots (passphrase and/or PQ recipients), optionally signs, RS-protects, renders PNG frames and optional WAV beacon, and muxes with ffmpeg. Evidence: [index.js](index.js#L114-L245)
- Data elements:
  - Input file bytes (Confidential/Restricted)
  - Passphrase (Restricted) Evidence: [index.js](index.js#L38-L48)
  - File key (Restricted) Evidence: [index.js](index.js#L144)
  - Ciphertext + nonce/tag (Confidential) Evidence: [crypto.js](crypto.js#L3-L10)
  - Manifest + originalName (Internal/Confidential metadata) Evidence: [packet.js](packet.js#L10-L28)
- Primary enforcement points:
  - AES-GCM authentication tag enforcement on decode. Evidence: [crypto.js](crypto.js#L12-L18)
  - Optional signatures for authenticity (if used). Evidence: [index.js](index.js#L173-L176), [signatures.js](signatures.js#L58-L90)

### Flow F2 — Decode untrusted MP4 (MP4 → recovered file)

- Description: invokes ffmpeg to extract frames and audio, decodes shards from frames with CRC checks, RS-recovers the packet, unwraps the file key from slots, decrypts, decompresses, writes output file. Evidence: [index.js](index.js#L261-L385)
- Sensitive boundary crossings:
  - External executable parsing untrusted media (ffmpeg). Evidence: [ffmpeg.js](ffmpeg.js#L55-L60)
  - Output file write based on packet `originalName`. Evidence: [index.js](index.js#L379)

### Flow F3 — Key unwrapping paths (passphrase slot vs PQ slot)

- Description: attempts passphrase unwrap first (if provided), then iterates PQ secret keys and PQ slots to decapsulate shared secrets and unwrap the file key. Evidence: [key_slots.js](key_slots.js#L55-L79)
- Data elements:
  - Wrapped key blob (Confidential)
  - PQ secret keys (Restricted)

### Flow F4 — Signature verification (optional)

- Description: if signature slots exist, verification is performed; Ed25519 uses embedded public key; ML-DSA uses embedded pk if present or caller-supplied pk. Evidence: [index.js](index.js#L342-L350), [signatures.js](signatures.js#L58-L90)

---

## 5. Threats

Legend: Likelihood and Impact are qualitative, assuming decode may be used on externally sourced MP4s.

| ID | Flow | Summary | STRIDE | OWASP | Likelihood | Impact | Status | Rationale |
|---|---|---|---|---|---|---|---|---|
| TM-01 | F1/F2 | Passphrase exposure via CLI args and shell history/process inspection | I | A02 Cryptographic Failures | H | H | Open | `--passphrase <text>` is part of normal usage; args can leak. Evidence: [index.js](index.js#L38-L48) |
| TM-02 | F2 | Path traversal on decode output using `originalName` from packet | T/E | A01 Broken Access Control | H | H | Open | Output path uses `path.join(outputDir, parsed.originalName ...)` without sanitization. Evidence: [index.js](index.js#L379) |
| TM-03 | F2 | ffmpeg exploitation via malicious MP4 leading to code execution | E | A06 Vulnerable and Outdated Components | M | H | Open | External binary parses attacker-controlled media; no sandboxing shown. Evidence: [ffmpeg.js](ffmpeg.js#L55-L60) |
| TM-04 | F1/F2 | Temp artifacts (frames/WAV) may remain on crash or abnormal exit | I | A09 Security Logging and Monitoring Failures | M | M | Open | Cleanup uses `rimraf(tmp)` at normal end; exceptions could leave temp dirs. Evidence: [index.js](index.js#L248-L249), [index.js](index.js#L384-L385) |
| TM-05 | F1 | Metadata leakage: original filename and manifest are plaintext in packet structure | I | A02 Cryptographic Failures | H | M | Open | `originalName` and manifest are serialized into packet body. Evidence: [packet.js](packet.js#L10-L28) |
| TM-06 | F1/F2 | Dependency/supply-chain compromise (argon2 native, PQ libs, png/wav libs) | T/E | A08 Software and Data Integrity Failures | M | H | Unknown | Dynamic imports and third-party libs expand trust base; repo lacks CI provenance checks. Evidence: [passphrase_wrap.js](passphrase_wrap.js#L6-L9), [pq.js](pq.js#L4-L23) |
| TM-07 | F3 | Offline brute-force of passphrase-wrapped key slot if passphrase is weak | I | A02 Cryptographic Failures | M | H | Open | Slot contains wrapped key + salt; attacker can attempt KDF guesses. Params are fixed; user entropy is key. Evidence: [passphrase_wrap.js](passphrase_wrap.js#L13-L80) |
| TM-08 | F2 | Denial of service via huge MP4/frames causing heavy CPU/memory usage | D | A04 Insecure Design | M | M | Open | Decoder iterates multiple candidates and processes many PNGs; no explicit limits. Evidence: [index.js](index.js#L295-L323), [grid_rs.js](grid_rs.js#L158-L232) |
| TM-09 | F2 | Decompression bomb after decryption (gzip/brotli) | D | A04 Insecure Design | L | M | Open | Decompression runs after successful decrypt; attacker needs victim to decrypt their payload (social/operational). Evidence: [index.js](index.js#L122-L129), [index.js](index.js#L377-L380) |
| TM-10 | F4 | Confusing authenticity expectations when signature slots are absent | R/I | A04 Insecure Design | M | M | Open | Encryption protects confidentiality/integrity but not “who created it” unless signatures are used and verified. Evidence: [signatures.js](signatures.js#L18-L90) |
| TM-11 | F1/F2 | Secrets in memory (fileKey, passphrase) not zeroized; possible leak via crash dumps | I | A02 Cryptographic Failures | L | M | Unknown | Node.js runtime and Buffers are not zeroized by default; no explicit hardening shown. Evidence: [index.js](index.js#L144-L151) |
| TM-12 | F2 | Audio beacon used for hints might be spoofed and mislead auto-detection | T | A04 Insecure Design | L | L | Mitigated | Audio is explicitly “non-fatal” and verified against video payload when possible. Evidence: [index.js](index.js#L263-L289), [index.js](index.js#L352-L372), [audio_meta.js](audio_meta.js#L53-L57) |

---

## 6. Mitigations

| Threat ID | Mitigation | Status | Location / Evidence | Notes |
|---|---|---|---|---|
| TM-01 | Avoid secrets in argv (stdin/file prompt) | ABSENT | Evidence of current argv usage: [index.js](index.js#L38-L48) | Consider `--passphrase-stdin` or interactive prompt; document operational guidance meanwhile. |
| TM-02 | Sanitize `originalName` on decode and enforce outputDir containment | ABSENT | [index.js](index.js#L379) | Strongly recommend restricting to basename and rejecting path separators and `..`. |
| TM-03 | Sandbox/contain ffmpeg, restrict inputs, keep ffmpeg updated | ABSENT | ffmpeg invoked: [ffmpeg.js](ffmpeg.js#L55-L60) | Containment options depend on OS (AppContainer/Job Object, seccomp, container). |
| TM-04 | Ensure temp cleanup on all failure paths | ABSENT | Cleanup only at normal completion: [index.js](index.js#L248-L249), [index.js](index.js#L384-L385) | Wrap encode/decode bodies in `try/finally` to guarantee cleanup. |
| TM-05 | Encrypt or minimize metadata; optionally hide filename/manifest | ABSENT | Packet structure: [packet.js](packet.js#L10-L28) | If public sharing is common, consider storing `originalName` encrypted or omit by default. |
| TM-06 | Dependency pinning, provenance, SCA, SBOM, verify optional modules | UNKNOWN | Dynamic import: [passphrase_wrap.js](passphrase_wrap.js#L6-L9), [pq.js](pq.js#L4-L23) | Add CI checks if this is distributed widely. |
| TM-07 | Strong KDFs and higher-cost defaults; allow user-configured KDF params | PARTIAL | scrypt + optional argon2id present: [passphrase_wrap.js](passphrase_wrap.js#L13-L80) | Params are hard-coded in CLI for argon2id and scrypt: [index.js](index.js#L151-L157). |
| TM-08 | Resource limits (max frames, max temp dir size, timeouts) | ABSENT | Candidate scanning: [index.js](index.js#L295-L323) | If decode is used on untrusted inputs, add safe limits/timeouts. |
| TM-10 | Clear UX: require verification for “authentic” mode | PARTIAL | Sign/verify supported: [index.js](index.js#L173-L176), [index.js](index.js#L342-L350) | Consider a mode that fails decode when signature verification fails/absent. |
| TM-12 | Beacon verified against video payload and treated as non-fatal | PRESENT | Verification: [index.js](index.js#L352-L372), [audio_meta.js](audio_meta.js#L53-L57) | Good defense against spoofed hint audio. |

---

## 7. High-risk interaction sequences (tool-validated)

### Sequence S1 — Encode file → MP4

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant CLI as yt-file-codec CLI
  participant FS as Local filesystem
  participant KDF as Passphrase KDF
  participant PQ as PQ module
  participant Crypto as AES-GCM
  participant Packet as Packet builder
  participant RS as RS protect
  participant Grid as Frame renderer
  participant Audio as Audio beacon
  participant FFmpeg as ffmpeg

  User->>CLI: encode inputFile output.mp4 (passphrase or PQ)
  CLI->>FS: readFile(inputFile)
  CLI->>CLI: compressIfUseful()
  CLI->>Crypto: encrypt(plaintext, fileKey)
  CLI->>KDF: wrapFileKeyWithPassphrase() (optional)
  CLI->>PQ: ml-kem encapsulate() (optional)
  CLI->>Packet: buildPacket(manifest, keySlots, sigSlots, ciphertext)
  CLI->>RS: rsProtectPayload(packet)
  CLI->>Grid: renderFramesFromProtectedPacket()
  Grid->>FS: write temp PNG frames
  CLI->>Audio: buildAudioValidationMeta() (optional)
  Audio->>FS: write temp WAV (optional)
  CLI->>FFmpeg: mux frames and audio to MP4
  FFmpeg->>FS: write output.mp4
  CLI-->>User: Done
```

**Evidence**
- Encode orchestration: [index.js](index.js#L114-L245)
- AES-GCM: [crypto.js](crypto.js#L3-L10)
- Passphrase wrap: [passphrase_wrap.js](passphrase_wrap.js#L44-L81)
- PQ encapsulate: [pq.js](pq.js#L38-L58)
- ffmpeg mux: [ffmpeg.js](ffmpeg.js#L19-L52)

### Sequence S2 — Decode MP4 → recovered file

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant CLI as yt-file-codec CLI
  participant FFmpeg as ffmpeg
  participant FS as Local filesystem
  participant Audio as Audio beacon
  participant Grid as Frame decoder
  participant RS as RS recover
  participant Packet as Packet parser
  participant Keys as Key slots
  participant PQ as PQ module
  participant Crypto as AES-GCM

  User->>CLI: decode input.mp4 outputDir (passphrase or PQ secret key)
  CLI->>FFmpeg: extract frames and audio from input.mp4
  FFmpeg->>FS: write temp PNG frames
  FFmpeg->>FS: write temp WAV (optional)

  CLI->>Audio: decode WAV for hints (best-effort)
  CLI->>Grid: decodeProtectedPacketShardsFromFrames()
  Grid-->>CLI: shards + present[]
  CLI->>RS: rsRecoverPayload(shards)
  RS-->>CLI: recovered packet bytes
  CLI->>Packet: parsePacket() and CRC check
  Packet-->>CLI: manifest, keySlots, nonce, tag, ciphertext

  CLI->>Keys: unwrapFileKeyFromSlots(passphrase or PQ secret keys)
  Keys->>PQ: ml-kem decapsulate() (optional)
  Keys-->>CLI: fileKey

  CLI->>Crypto: decrypt(nonce, tag, ciphertext, fileKey)
  CLI->>CLI: decompress by mode
  CLI->>FS: write recovered file into outputDir
  CLI-->>User: Done
```

**Evidence**
- Decode orchestration: [index.js](index.js#L261-L385)
- ffmpeg extract: [ffmpeg.js](ffmpeg.js#L55-L60)
- Shard decoding and CRC checks: [grid_rs.js](grid_rs.js#L158-L200)
- Output path join risk: [index.js](index.js#L379)

### Sequence S3 — Signature verification reporting

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant CLI as yt-file-codec CLI
  participant Packet as Packet parser
  participant Sig as Signature slots
  participant PQ as PQ module

  User->>CLI: decode input.mp4 outputDir (verify flags optional)
  CLI->>Packet: parsePacket() -> signatureSlotsBlob
  CLI->>Sig: verifySignatureSlots(messageHash)
  Sig->>Sig: Ed25519 verify with embedded public key
  Sig->>PQ: ML-DSA verify (optional)
  Sig-->>CLI: results per slot (OK or FAIL)
  CLI-->>User: Print verification results
```

**Evidence**
- Verification callsite: [index.js](index.js#L342-L350)
- Ed25519 verify: [signatures.js](signatures.js#L64)
- ML-DSA verify with embedded pk preference: [signatures.js](signatures.js#L71-L79)

---

## 8. Validation plan (no code)

1) **Path traversal safety check (TM-02)**
- Intent: confirm decode cannot write outside outputDir.
- Preconditions: create or obtain an MP4 where packet `originalName` contains `../` or an absolute path.
- Steps: run decode into a controlled outputDir; monitor file writes.
- Expected: tool rejects unsafe names or writes only inside outputDir.
- Evidence to collect: file system audit (created files), console output.
- Owner: maintainer + security reviewer.

2) **Untrusted MP4 hardening check (TM-03)**
- Intent: quantify ffmpeg risk and decide sandboxing requirements.
- Preconditions: set of malformed/corrupt MP4s (and optionally known fuzz corpora).
- Steps: run decode under a constrained environment; watch for crashes and unexpected behavior.
- Expected: no process compromise; failures are handled as errors.
- Evidence to collect: crash logs, Windows Event Log / core dumps, ffmpeg version output.
- Owner: maintainer.

3) **Secret handling operational review (TM-01)**
- Intent: ensure no passphrases appear in logs/history.
- Steps: run encode/decode; check shell history, process explorer output, crash reports.
- Expected: secrets not recorded outside user input channel.
- Evidence to collect: screenshots/log snippets, documented guidance.
- Owner: maintainer.

4) **Temp artifact persistence check (TM-04)**
- Intent: verify temp dirs are removed on failures.
- Steps: kill the process mid-encode and mid-decode; inspect OS temp for `ytfc-enc-*`/`ytfc-dec-*`.
- Expected: minimal sensitive residue; documented cleanup steps.
- Evidence to collect: directory listings before/after, reproduction notes.
- Owner: maintainer.

5) **Authenticity expectations check (TM-10)**
- Intent: validate that signature verification is clear and actionable.
- Steps: encode with Ed25519 signing; decode and confirm "Signature ed25519: OK"; then tamper MP4 and confirm FAIL.
- Expected: users can reliably detect tampering/impersonation when signatures are used.
- Evidence to collect: command transcript, output logs.
- Owner: maintainer.

---

## 9. Owners

- Who confirms assumptions: **UNKNOWN** (maintainer/product owner)
- Who drives mitigations: maintainer
- Who validates fixes: security reviewer + maintainer

---

## 10. Open questions

- Is decoding arbitrary internet MP4s in-scope? Owner: product owner. Where to look: README usage expectations in [README.md](README.md)
- Is metadata confidentiality (original filename/manifest) required? Owner: product owner. Evidence: [packet.js](packet.js#L10-L28)
- Should signatures be mandatory in some mode (fail decode if missing/FAIL)? Owner: maintainer. Evidence: [index.js](index.js#L342-L350)
- What OS-level sandboxing is acceptable for ffmpeg on Windows? Owner: maintainer/ops.

---

## ✅ Quality checks

- Diagrams included: DFD L0, DFD L1, trust boundary, 3 sequences.
- All Mermaid diagrams were validated using `mermaid-diagram-validator`.
- PRESENT mitigations include concrete code references.
- UNKNOWN items have follow-up questions and owners.
