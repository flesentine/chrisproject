/*
  NativeMppReader v0.3
  Browser-only Microsoft Project .mpp reader foundation.

  What this does:
  - Reads .mpp files directly in the browser with File/ArrayBuffer.
  - Parses the OLE/CFB compound-file container used by native .mpp files.
  - Reads summary metadata and stream inventory.
  - Detects embedded MSPDI/XML and imports it when present.
  - Adds a stronger recovery layer: stream scoring, UTF-16/ANSI/length-prefixed string mining,
    date hint discovery, diagnostics JSON, stream-bucket ordering, compressed XML sniffing, and a best-effort draft task-name import.

  What this still does not fully do:
  - Decode every private Microsoft Project binary table the way MPXJ does.
  - Guarantee real task/date/resource recovery from every native .mpp version.

  No backend. No uploads. No dependencies.
*/
(function () {
  "use strict";

  const VERSION = "0.3.0";
  const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const ENDOFCHAIN = -2;
  const MAX_TEXT_SCAN_BYTES = 2 * 1024 * 1024;
  const MAX_STREAMS_TO_MINE = 180;

  const textDecoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const textDecoderUtf16 = new TextDecoder("utf-16le", { fatal: false });

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function hasSignature(bytes, signature) {
    return signature.every((value, index) => bytes[index] === value);
  }

  function readUInt16(view, offset) {
    return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
  }

  function readUInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
  }

  function readInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : ENDOFCHAIN;
  }

  function decodeUtf16Name(bytes, start, byteLength) {
    if (!byteLength) return "";
    const usable = Math.max(0, byteLength - 2);
    return textDecoderUtf16.decode(bytes.slice(start, start + usable)).replace(/\0+$/g, "");
  }

  function sectorOffset(sectorId, sectorSize) {
    return 512 + sectorId * sectorSize;
  }

  function clampBytes(bytes, size) {
    return Number.isFinite(size) && size >= 0 ? bytes.slice(0, size) : bytes;
  }

  function normalizeStreamName(name) {
    return String(name || "").replace(/^\u0005/, "");
  }

  function readFileTime(low, high) {
    if (!low && !high) return null;
    try {
      const hundredNs = (BigInt(high) << 32n) | BigInt(low);
      const epochDiff = 116444736000000000n;
      const ms = Number((hundredNs - epochDiff) / 10000n);
      if (!Number.isFinite(ms)) return null;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  function toIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function isReasonableDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const year = date.getUTCFullYear();
    return year >= 1990 && year <= 2050;
  }

  function cfbPath(entries, entry) {
    const parts = [];
    let current = entry;
    let guard = 0;
    while (current && current.parentIndex != null && current.parentIndex >= 0 && guard < 100) {
      if (current.name !== "Root Entry") parts.unshift(current.name);
      current = entries.find((candidate) => candidate.index === current.parentIndex);
      guard += 1;
    }
    return parts.join("/");
  }

  class CompoundFileBinary {
    constructor(arrayBuffer) {
      this.buffer = arrayBuffer;
      this.bytes = new Uint8Array(arrayBuffer);
      this.view = new DataView(arrayBuffer);
      this.entries = [];
      this.streamCache = new Map();
      this.parse();
    }

    parse() {
      assert(this.bytes.length >= 512, "File is too small to be an MPP/OLE compound document.");
      assert(hasSignature(this.bytes, CFB_SIGNATURE), "This is not an OLE compound document. It may not be a native .mpp file.");

      this.sectorShift = readUInt16(this.view, 0x1e);
      this.miniSectorShift = readUInt16(this.view, 0x20);
      this.sectorSize = 1 << this.sectorShift;
      this.miniSectorSize = 1 << this.miniSectorShift;
      this.numFatSectors = readUInt32(this.view, 0x2c);
      this.firstDirectorySector = readInt32(this.view, 0x30);
      this.miniStreamCutoff = readUInt32(this.view, 0x38);
      this.firstMiniFatSector = readInt32(this.view, 0x3c);
      this.numMiniFatSectors = readUInt32(this.view, 0x40);
      this.firstDifatSector = readInt32(this.view, 0x44);
      this.numDifatSectors = readUInt32(this.view, 0x48);

      assert(this.sectorSize >= 512 && this.sectorSize <= 4096, "Unsupported CFB sector size.");
      assert(this.miniSectorSize >= 32 && this.miniSectorSize <= 128, "Unsupported CFB mini-sector size.");

      this.difat = this.readDifat();
      this.fat = this.readFat();
      this.directoryBytes = this.readRegularStream(this.firstDirectorySector);
      this.entries = this.parseDirectory(this.directoryBytes);
      this.assignParents();
      this.rootEntry = this.entries.find((entry) => entry.type === 5) || this.entries[0];
      this.miniFat = this.readMiniFat();
      this.rootMiniStream = this.rootEntry ? this.readRegularStream(this.rootEntry.startSector, this.rootEntry.size) : new Uint8Array();
    }

    readDifat() {
      const entries = [];
      for (let offset = 0x4c; offset < 0x4c + 109 * 4; offset += 4) {
        const sector = readInt32(this.view, offset);
        if (sector >= 0) entries.push(sector);
      }

      let current = this.firstDifatSector;
      const entriesPerDifatSector = this.sectorSize / 4 - 1;
      const seen = new Set();
      for (let i = 0; i < this.numDifatSectors && current >= 0 && !seen.has(current); i += 1) {
        seen.add(current);
        const offset = sectorOffset(current, this.sectorSize);
        if (offset + this.sectorSize > this.bytes.length) break;
        for (let j = 0; j < entriesPerDifatSector; j += 1) {
          const sector = readInt32(this.view, offset + j * 4);
          if (sector >= 0) entries.push(sector);
        }
        current = readInt32(this.view, offset + entriesPerDifatSector * 4);
      }
      return entries.slice(0, this.numFatSectors || entries.length);
    }

    readFat() {
      const fat = [];
      this.difat.forEach((sectorId) => {
        if (sectorId < 0) return;
        const offset = sectorOffset(sectorId, this.sectorSize);
        if (offset + this.sectorSize > this.bytes.length) return;
        for (let i = 0; i < this.sectorSize / 4; i += 1) {
          fat.push(readInt32(this.view, offset + i * 4));
        }
      });
      return fat;
    }

    readSector(sectorId) {
      const offset = sectorOffset(sectorId, this.sectorSize);
      assert(offset >= 512 && offset + this.sectorSize <= this.bytes.length, `Invalid sector ${sectorId}.`);
      return this.bytes.slice(offset, offset + this.sectorSize);
    }

    readRegularStream(startSector, size = null) {
      if (startSector < 0 || startSector === ENDOFCHAIN) return new Uint8Array();
      const chunks = [];
      let current = startSector;
      const seen = new Set();
      let guard = 0;
      while (current >= 0 && current !== ENDOFCHAIN && !seen.has(current) && guard < this.fat.length + 8) {
        seen.add(current);
        chunks.push(this.readSector(current));
        current = this.fat[current];
        guard += 1;
      }
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      chunks.forEach((chunk) => {
        out.set(chunk, offset);
        offset += chunk.length;
      });
      return size == null ? out : clampBytes(out, size);
    }

    parseDirectory(directoryBytes) {
      const entries = [];
      const entryCount = Math.floor(directoryBytes.length / 128);
      const view = new DataView(directoryBytes.buffer, directoryBytes.byteOffset, directoryBytes.byteLength);
      for (let i = 0; i < entryCount; i += 1) {
        const offset = i * 128;
        const nameLength = readUInt16(view, offset + 64);
        const name = decodeUtf16Name(directoryBytes, offset, Math.min(nameLength, 64));
        const type = directoryBytes[offset + 66];
        if (!name && type === 0) continue;
        const left = readInt32(view, offset + 68);
        const right = readInt32(view, offset + 72);
        const child = readInt32(view, offset + 76);
        const startSector = readInt32(view, offset + 116);
        const lowSize = readUInt32(view, offset + 120);
        const highSize = readUInt32(view, offset + 124);
        const size = highSize ? Number((BigInt(highSize) << 32n) | BigInt(lowSize)) : lowSize;
        entries.push({
          index: i,
          name,
          normalizedName: normalizeStreamName(name),
          type,
          left,
          right,
          child,
          startSector,
          size,
          parentIndex: null,
          path: name,
        });
      }
      return entries;
    }

    assignParents() {
      const byIndex = new Map(this.entries.map((entry) => [entry.index, entry]));
      const visitTree = (childIndex, parentIndex) => {
        const child = byIndex.get(childIndex);
        if (!child) return;
        child.parentIndex = parentIndex;
        if (child.left >= 0) visitTree(child.left, parentIndex);
        if (child.right >= 0) visitTree(child.right, parentIndex);
        if (child.child >= 0) visitTree(child.child, child.index);
      };
      const root = this.entries.find((entry) => entry.type === 5) || this.entries[0];
      if (root?.child >= 0) visitTree(root.child, root.index);
      this.entries.forEach((entry) => {
        entry.path = cfbPath(this.entries, entry) || entry.name;
      });
    }

    readMiniFat() {
      if (this.firstMiniFatSector < 0 || !this.numMiniFatSectors) return [];
      const bytes = this.readRegularStream(this.firstMiniFatSector, this.numMiniFatSectors * this.sectorSize);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const fat = [];
      for (let i = 0; i < Math.floor(bytes.length / 4); i += 1) {
        fat.push(readInt32(view, i * 4));
      }
      return fat;
    }

    readMiniStream(startMiniSector, size) {
      if (startMiniSector < 0 || startMiniSector === ENDOFCHAIN) return new Uint8Array();
      const chunks = [];
      let current = startMiniSector;
      const seen = new Set();
      let guard = 0;
      while (current >= 0 && current !== ENDOFCHAIN && !seen.has(current) && guard < this.miniFat.length + 8) {
        seen.add(current);
        const offset = current * this.miniSectorSize;
        chunks.push(this.rootMiniStream.slice(offset, offset + this.miniSectorSize));
        current = this.miniFat[current];
        guard += 1;
      }
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      chunks.forEach((chunk) => {
        out.set(chunk, offset);
        offset += chunk.length;
      });
      return clampBytes(out, size);
    }

    getStream(entry) {
      if (!entry || entry.type !== 2) return new Uint8Array();
      if (this.streamCache.has(entry.index)) return this.streamCache.get(entry.index);
      const stream = entry.size < this.miniStreamCutoff
        ? this.readMiniStream(entry.startSector, entry.size)
        : this.readRegularStream(entry.startSector, entry.size);
      this.streamCache.set(entry.index, stream);
      return stream;
    }

    listStreams() {
      return this.entries
        .filter((entry) => entry.type === 2)
        .map((entry) => ({
          name: entry.name,
          normalizedName: entry.normalizedName,
          path: entry.path,
          size: entry.size,
          score: scoreStream(entry),
        }))
        .sort((a, b) => b.score - a.score || b.size - a.size);
    }
  }

  function parsePropertySet(bytes) {
    if (!bytes || bytes.length < 48) return {};
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (readUInt16(view, 0) !== 0xfffe) return {};
    const sectionCount = readUInt32(view, 24);
    const properties = {};

    for (let section = 0; section < sectionCount; section += 1) {
      const sectionTableOffset = 28 + section * 20;
      if (sectionTableOffset + 20 > bytes.length) break;
      const sectionOffset = readUInt32(view, sectionTableOffset + 16);
      if (sectionOffset + 8 > bytes.length) continue;
      const propertyCount = readUInt32(view, sectionOffset + 4);
      for (let i = 0; i < propertyCount; i += 1) {
        const propTableOffset = sectionOffset + 8 + i * 8;
        if (propTableOffset + 8 > bytes.length) break;
        const propertyId = readUInt32(view, propTableOffset);
        const valueOffset = sectionOffset + readUInt32(view, propTableOffset + 4);
        if (valueOffset + 4 > bytes.length) continue;
        properties[propertyId] = readTypedProperty(view, bytes, valueOffset);
      }
    }
    return properties;
  }

  function readTypedProperty(view, bytes, offset) {
    const type = readUInt32(view, offset);
    const valueOffset = offset + 4;
    try {
      if (type === 2) return view.getInt16(valueOffset, true);
      if (type === 3) return view.getInt32(valueOffset, true);
      if (type === 11) return readUInt16(view, valueOffset) !== 0;
      if (type === 19) return readUInt32(view, valueOffset);
      if (type === 30) {
        const length = readUInt32(view, valueOffset);
        return textDecoderUtf8.decode(bytes.slice(valueOffset + 4, valueOffset + 4 + Math.max(0, length - 1))).replace(/\0+$/g, "");
      }
      if (type === 31) {
        const length = readUInt32(view, valueOffset);
        return textDecoderUtf16.decode(bytes.slice(valueOffset + 4, valueOffset + 4 + Math.max(0, length * 2 - 2))).replace(/\0+$/g, "");
      }
      if (type === 64) {
        const date = readFileTime(readUInt32(view, valueOffset), readUInt32(view, valueOffset + 4));
        return date ? date.toISOString() : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  function extractMetadata(cfb) {
    const summaryLabels = {
      2: "title",
      3: "subject",
      4: "author",
      5: "keywords",
      6: "comments",
      7: "template",
      8: "lastSavedBy",
      9: "revisionNumber",
      12: "createdAt",
      13: "modifiedAt",
      18: "application",
    };
    const docLabels = {
      2: "category",
      14: "manager",
      15: "company",
    };
    const metadata = {};
    cfb.entries.filter((entry) => entry.type === 2).forEach((entry) => {
      const normalized = entry.normalizedName;
      if (normalized !== "SummaryInformation" && normalized !== "DocumentSummaryInformation") return;
      const props = parsePropertySet(cfb.getStream(entry));
      const labels = normalized === "SummaryInformation" ? summaryLabels : docLabels;
      Object.entries(props).forEach(([id, value]) => {
        const key = labels[id];
        if (key && value != null && value !== "") metadata[key] = value;
      });
    });
    return metadata;
  }

  function decodeUtf16Be(bytes) {
    const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      swapped[i] = bytes[i + 1];
      swapped[i + 1] = bytes[i];
    }
    return textDecoderUtf16.decode(swapped);
  }

  function decodeLikelyText(bytes) {
    return [
      textDecoderUtf8.decode(bytes),
      textDecoderUtf16.decode(bytes),
      decodeUtf16Be(bytes),
    ];
  }

  async function maybeDecompress(bytes, format) {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      const buffer = await new Response(stream).arrayBuffer();
      if (!buffer || buffer.byteLength < 32 || buffer.byteLength > 64 * 1024 * 1024) return null;
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  function extractXmlFromText(text) {
    const start = text.search(/<Project[\s>]/i);
    const end = text.search(/<\/Project>/i);
    if (start >= 0 && end > start) return text.slice(start, end + "</Project>".length);
    return null;
  }

  function findEmbeddedProjectXml(cfb) {
    const streamEntries = cfb.entries
      .filter((item) => item.type === 2)
      .sort((a, b) => scoreStream(b) - scoreStream(a) || b.size - a.size);

    for (const entry of streamEntries) {
      const bytes = cfb.getStream(entry);
      if (!bytes.length) continue;
      for (const text of decodeLikelyText(bytes.slice(0, Math.min(bytes.length, 12 * 1024 * 1024)))) {
        const xml = extractXmlFromText(text);
        if (xml) return { xml, stream: entry.path || entry.name, compressed: false };
      }
    }
    return null;
  }

  async function findEmbeddedProjectXmlAsync(cfb) {
    const direct = findEmbeddedProjectXml(cfb);
    if (direct) return direct;

    const streamEntries = cfb.entries
      .filter((item) => item.type === 2 && item.size > 64)
      .sort((a, b) => scoreStream(b) - scoreStream(a) || b.size - a.size)
      .slice(0, 40);

    for (const entry of streamEntries) {
      const original = cfb.getStream(entry).slice(0, Math.min(entry.size, 16 * 1024 * 1024));
      const candidates = [];
      for (const format of ["deflate", "gzip"]) {
        const inflated = await maybeDecompress(original, format);
        if (inflated) candidates.push({ bytes: inflated, format });
      }
      for (const candidate of candidates) {
        for (const text of decodeLikelyText(candidate.bytes)) {
          const xml = extractXmlFromText(text);
          if (xml) {
            return {
              xml,
              stream: entry.path || entry.name,
              compressed: true,
              compression: candidate.format,
            };
          }
        }
      }
    }
    return null;
  }

  function scoreStream(entry) {
    const text = `${entry.path || ""}/${entry.normalizedName || entry.name || ""}`.toLowerCase();
    let score = 0;
    if (/task|tsk|name|wbs|outline/.test(text)) score += 45;
    if (/assign|resource|res|link|predecessor|successor|depend/.test(text)) score += 25;
    if (/project|props|property|metadata|calendar|schedule|date/.test(text)) score += 18;
    if (/table|data|var|fixed|value|record|row/.test(text)) score += 12;
    if (/summary|document/.test(text)) score += 8;
    if (/ole|compobj|font|view|print|window/.test(text)) score -= 8;
    return score;
  }

  function isPrintableAscii(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  }

  function isPrintableCodePoint(code) {
    if (code === 9 || code === 10 || code === 13) return true;
    if (code >= 32 && code <= 0x007e) return true;
    if (code >= 0x00a0 && code <= 0xffff) return true;
    return false;
  }

  function cleanCandidate(raw) {
    return String(raw || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function badCandidate(value) {
    const text = cleanCandidate(value);
    if (text.length < 3 || text.length > 90) return true;
    if (!/[A-Za-z\p{L}]/u.test(text)) return true;
    if (/^[0-9 .:/\-]+$/.test(text)) return true;
    if (/^(Microsoft|MSProject|Root Entry|SummaryInformation|DocumentSummaryInformation|CompObj|Ole|Standard|Times New Roman|Arial|Calibri|Tahoma|Windows|Project|Unknown|Default|Normal|English|United States|Page|Task Name|Start|Finish|Duration|Resource Names)$/i.test(text)) return true;
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(text)) return true;
    if (/https?:\/\//i.test(text)) return true;
    if (/�/.test(text)) return true;
    if (/(.)\1{5,}/.test(text)) return true;
    if (/^[A-Z]{1,2}[0-9]{3,}$/i.test(text)) return true;
    if (/^(true|false|null|none|yes|no|ok|cancel|open|save|close|print)$/i.test(text)) return true;
    if (text.split(" ").length > 12) return true;
    const punctuation = (text.match(/[^\p{L}\p{N} ]/gu) || []).length;
    if (punctuation > Math.max(3, Math.floor(text.length / 4))) return true;
    return false;
  }

  function candidateScore(value, streamScore, method) {
    let score = streamScore || 0;
    const text = cleanCandidate(value);
    if (/\s/.test(text)) score += 6;
    if (/^[A-Z][A-Za-z0-9]/.test(text)) score += 4;
    if (text.length >= 8 && text.length <= 48) score += 5;
    if (/milestone|review|design|build|test|deploy|launch|submit|requirement|phase|task|approval|release|plan/i.test(text)) score += 8;
    if (method === "length-prefixed-utf16") score += 10;
    if (method === "length-prefixed-ansi") score += 7;
    if (method === "utf16-run") score += 4;
    if (method === "ansi-run") score += 1;
    if (/^(font|table|view|calendar|resource|assignment)$/i.test(text)) score -= 10;
    return score;
  }

  function addCandidate(map, value, entry, method, offset = null) {
    const text = cleanCandidate(value);
    if (badCandidate(text)) return;
    const key = text.toLowerCase();
    const streamScore = scoreStream(entry);
    const score = candidateScore(text, streamScore, method);
    const existing = map.get(key);
    const stream = entry?.path || entry?.name || "file";
    if (!existing || score > existing.score) {
      map.set(key, {
        value: text,
        score,
        method,
        stream,
        firstOffset: Number.isFinite(offset) ? offset : null,
        offsets: Number.isFinite(offset) ? [offset] : [],
        occurrences: 1,
      });
    } else {
      existing.occurrences = (existing.occurrences || 1) + 1;
      if (Number.isFinite(offset) && existing.offsets && existing.offsets.length < 8) existing.offsets.push(offset);
      if (existing.stream === stream && existing.firstOffset == null && Number.isFinite(offset)) existing.firstOffset = offset;
    }
  }

  function extractAnsiRuns(bytes, entry, map) {
    let start = -1;
    for (let i = 0; i <= bytes.length; i += 1) {
      const code = i < bytes.length ? bytes[i] : 0;
      if (i < bytes.length && isPrintableAscii(code) && code !== 0) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start >= 3) {
          const raw = textDecoderUtf8.decode(bytes.slice(start, i));
          raw.split(/[\r\n\t]+/).forEach((part) => addCandidate(map, part, entry, "ansi-run", start));
        }
        start = -1;
      }
    }
  }

  function extractUtf16Runs(bytes, entry, map) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 0;
    while (i + 6 <= bytes.length) {
      const chars = [];
      const start = i;
      while (i + 2 <= bytes.length) {
        const code = readUInt16(view, i);
        if (!code || !isPrintableCodePoint(code)) break;
        chars.push(code);
        i += 2;
        if (chars.length >= 90) break;
      }
      if (chars.length >= 3) {
        const raw = textDecoderUtf16.decode(bytes.slice(start, start + chars.length * 2));
        raw.split(/[\r\n\t]+/).forEach((part) => addCandidate(map, part, entry, "utf16-run", start));
      }
      i = Math.max(i + 2, start + 2);
    }
  }

  function extractLengthPrefixedUtf16(bytes, entry, map) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 8 < bytes.length; offset += 1) {
      const len16 = readUInt16(view, offset);
      if (len16 >= 3 && len16 <= 90 && offset + 2 + len16 * 2 <= bytes.length) {
        const slice = bytes.slice(offset + 2, offset + 2 + len16 * 2);
        if (looksMostlyUtf16(slice)) addCandidate(map, textDecoderUtf16.decode(slice), entry, "length-prefixed-utf16", offset);
      }
      const len32 = readUInt32(view, offset);
      if (len32 >= 3 && len32 <= 90 && offset + 4 + len32 * 2 <= bytes.length) {
        const slice = bytes.slice(offset + 4, offset + 4 + len32 * 2);
        if (looksMostlyUtf16(slice)) addCandidate(map, textDecoderUtf16.decode(slice), entry, "length-prefixed-utf16", offset);
      }
    }
  }

  function looksMostlyUtf16(bytes) {
    if (bytes.length < 6 || bytes.length % 2 !== 0) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let good = 0;
    let total = 0;
    for (let i = 0; i + 2 <= bytes.length; i += 2) {
      const code = readUInt16(view, i);
      total += 1;
      if (code && isPrintableCodePoint(code)) good += 1;
    }
    return total > 0 && good / total > 0.85;
  }

  function looksMostlyAnsi(bytes) {
    if (bytes.length < 3) return false;
    let good = 0;
    for (const byte of bytes) {
      if (byte && isPrintableAscii(byte)) good += 1;
    }
    return good / bytes.length > 0.88;
  }

  function extractLengthPrefixedAnsi(bytes, entry, map) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 5 < bytes.length; offset += 1) {
      const len8 = bytes[offset];
      if (len8 >= 3 && len8 <= 90 && offset + 1 + len8 <= bytes.length) {
        const slice = bytes.slice(offset + 1, offset + 1 + len8);
        if (looksMostlyAnsi(slice)) addCandidate(map, textDecoderUtf8.decode(slice), entry, "length-prefixed-ansi", offset);
      }
      const len16 = readUInt16(view, offset);
      if (len16 >= 3 && len16 <= 90 && offset + 2 + len16 <= bytes.length) {
        const slice = bytes.slice(offset + 2, offset + 2 + len16);
        if (looksMostlyAnsi(slice)) addCandidate(map, textDecoderUtf8.decode(slice), entry, "length-prefixed-ansi", offset);
      }
      const len32 = readUInt32(view, offset);
      if (len32 >= 3 && len32 <= 90 && offset + 4 + len32 <= bytes.length) {
        const slice = bytes.slice(offset + 4, offset + 4 + len32);
        if (looksMostlyAnsi(slice)) addCandidate(map, textDecoderUtf8.decode(slice), entry, "length-prefixed-ansi", offset);
      }
    }
  }

  function extractCandidateStrings(cfb) {
    const map = new Map();
    const entries = cfb.entries
      .filter((item) => item.type === 2 && item.size > 0)
      .sort((a, b) => scoreStream(b) - scoreStream(a) || b.size - a.size)
      .slice(0, MAX_STREAMS_TO_MINE);

    for (const entry of entries) {
      const bytes = cfb.getStream(entry).slice(0, MAX_TEXT_SCAN_BYTES);
      if (!bytes.length) continue;
      extractLengthPrefixedUtf16(bytes, entry, map);
      extractLengthPrefixedAnsi(bytes, entry, map);
      extractUtf16Runs(bytes, entry, map);
      extractAnsiRuns(bytes, entry, map);
    }

    return [...map.values()]
      .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
      .slice(0, 120);
  }

  function extractDateHints(cfb) {
    const dates = new Map();
    const entries = cfb.entries
      .filter((item) => item.type === 2 && item.size > 0)
      .sort((a, b) => scoreStream(b) - scoreStream(a) || b.size - a.size)
      .slice(0, 50);

    const addDate = (date, entry, method) => {
      if (!isReasonableDate(date)) return;
      const iso = toIsoDate(date);
      const existing = dates.get(iso) || { date: iso, count: 0, streams: new Set(), methods: new Set() };
      existing.count += 1;
      existing.streams.add(entry.path || entry.name);
      existing.methods.add(method);
      dates.set(iso, existing);
    };

    for (const entry of entries) {
      const bytes = cfb.getStream(entry).slice(0, Math.min(512 * 1024, cfb.getStream(entry).length));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let offset = 0; offset + 8 <= bytes.length; offset += 4) {
        const filetime = readFileTime(readUInt32(view, offset), readUInt32(view, offset + 4));
        if (filetime) addDate(filetime, entry, "filetime");
        const oa = view.getFloat64(offset, true);
        if (oa > 30000 && oa < 60000) {
          const date = new Date(Date.UTC(1899, 11, 30) + oa * 86400000);
          addDate(date, entry, "ole-date");
        }
      }
    }

    return [...dates.values()]
      .map((item) => ({
        date: item.date,
        count: item.count,
        streams: [...item.streams].slice(0, 4),
        methods: [...item.methods],
      }))
      .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
      .slice(0, 40);
  }

  function buildStreamBuckets(candidateObjects) {
    const buckets = new Map();
    for (const candidate of candidateObjects || []) {
      const key = candidate.stream || "unknown";
      const bucket = buckets.get(key) || {
        stream: key,
        count: 0,
        score: 0,
        taskLikeCount: 0,
        candidates: [],
      };
      bucket.count += 1;
      bucket.score += candidate.score || 0;
      if (/milestone|review|design|build|test|deploy|launch|submit|requirement|phase|task|approval|release|plan/i.test(candidate.value)) {
        bucket.taskLikeCount += 1;
      }
      bucket.candidates.push(candidate);
      buckets.set(key, bucket);
    }
    return [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        averageScore: bucket.count ? Math.round(bucket.score / bucket.count) : 0,
        candidates: bucket.candidates
          .sort((a, b) => (a.firstOffset ?? 999999999) - (b.firstOffset ?? 999999999) || b.score - a.score)
          .slice(0, 60),
      }))
      .sort((a, b) => b.taskLikeCount - a.taskLikeCount || b.averageScore - a.averageScore || b.count - a.count)
      .slice(0, 20);
  }

  function chooseDraftCandidates(candidateObjects, streamBuckets) {
    const strongBucket = streamBuckets.find((bucket) => bucket.count >= 4 && bucket.averageScore >= 40);
    const ordered = strongBucket
      ? strongBucket.candidates
      : [...candidateObjects].sort((a, b) => b.score - a.score || (a.firstOffset ?? 999999999) - (b.firstOffset ?? 999999999));

    const out = [];
    const seen = new Set();
    const tooSimilar = (value) => out.some((item) => {
      const a = item.value.toLowerCase();
      const b = value.toLowerCase();
      return a.includes(b) || b.includes(a);
    });

    for (const candidate of ordered) {
      const value = candidate.value;
      const key = value.toLowerCase();
      if (seen.has(key) || tooSimilar(value)) continue;
      seen.add(key);
      out.push(candidate);
      if (out.length >= 60) break;
    }
    return out;
  }

  function buildDraftProject(fileName, metadata, candidateObjects, dateHints) {
    const streamBuckets = buildStreamBuckets(candidateObjects);
    const picked = chooseDraftCandidates(candidateObjects, streamBuckets);
    const names = [];
    for (const candidate of picked) {
      names.push({
        name: candidate.value,
        confidence: Math.max(0, Math.min(100, Math.round(candidate.score + 30))),
        source: candidate.stream,
        method: candidate.method,
        offset: candidate.firstOffset,
        occurrences: candidate.occurrences || 1,
      });
      if (names.length >= 60) break;
    }
    const sortedDates = [...(dateHints || [])]
      .map((item) => item.date)
      .filter(Boolean)
      .sort();
    const start = sortedDates[0] || new Date().toISOString().slice(0, 10);
    const topStream = streamBuckets[0] || null;
    const confidenceText = names.length
      ? topStream
        ? `best-effort text recovery, strongest stream: ${topStream.stream}`
        : "best-effort text recovery"
      : "no usable task-name hints found";
    return {
      name: metadata?.title || metadata?.subject || fileName.replace(/\.mpp$/i, "") || "Recovered MPP draft",
      start,
      taskCount: names.length,
      tasks: names,
      confidence: confidenceText,
      topStream: topStream ? {
        stream: topStream.stream,
        count: topStream.count,
        averageScore: topStream.averageScore,
        taskLikeCount: topStream.taskLikeCount,
      } : null,
      streamBuckets: streamBuckets.map((bucket) => ({
        stream: bucket.stream,
        count: bucket.count,
        averageScore: bucket.averageScore,
        taskLikeCount: bucket.taskLikeCount,
      })),
    };
  }

  function parseProjectXmlPreview(xmlText) {
    if (typeof DOMParser === "undefined") return null;
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.getElementsByTagName("parsererror")[0]) return null;
    const projectNode = [...xml.children].find((node) => node.localName === "Project") || xml.documentElement;
    if (!projectNode || projectNode.localName !== "Project") return null;
    const tasks = [...xml.getElementsByTagName("Task")]
      .filter((node) => {
        const id = Number(childText(node, "ID"));
        return id > 0 && childText(node, "IsNull") !== "1" && childText(node, "Name");
      })
      .map((node) => ({
        id: Number(childText(node, "ID")),
        name: childText(node, "Name"),
        start: childText(node, "Start").slice(0, 10),
        finish: childText(node, "Finish").slice(0, 10),
      }));
    return {
      name: childText(projectNode, "Name") || childText(projectNode, "Title") || "Imported MPP",
      start: childText(projectNode, "StartDate").slice(0, 10) || tasks[0]?.start || "",
      taskCount: tasks.length,
      tasks,
    };
  }

  function childText(node, localName) {
    const child = [...node.children].find((item) => item.localName === localName);
    return child ? child.textContent.trim() : "";
  }

  function buildDiagnostics(result) {
    return {
      readerVersion: VERSION,
      fileName: result.fileName,
      fileSize: result.fileSize,
      mppContainerRead: result.mppContainerRead,
      sectorSize: result.sectorSize,
      miniSectorSize: result.miniSectorSize,
      metadata: result.metadata,
      embeddedXml: result.embeddedXml,
      project: result.project,
      streamCount: result.streams?.length || 0,
      topStreams: (result.streams || []).slice(0, 80),
      candidateStrings: (result.candidateStrings || []).slice(0, 80),
      dateHints: (result.dateHints || []).slice(0, 40),
      draftProject: result.draftProject,
      streamBuckets: result.draftProject?.streamBuckets || [],
      recoveryStats: result.recoveryStats,
      warnings: result.warnings,
    };
  }

  async function read(file) {
    const buffer = await file.arrayBuffer();
    return readBufferAsync(buffer, file.name || "project.mpp");
  }

  async function readBufferAsync(buffer, fileName = "project.mpp") {
    const result = readBuffer(buffer, fileName, { skipDeepXml: true });
    if (result.projectXml || !result.mppContainerRead) return result;

    try {
      const cfb = new CompoundFileBinary(buffer);
      const xmlHit = await findEmbeddedProjectXmlAsync(cfb);
      if (xmlHit) {
        result.projectXml = xmlHit.xml;
        result.embeddedXml = {
          stream: xmlHit.stream,
          size: xmlHit.xml.length,
          compressed: Boolean(xmlHit.compressed),
          compression: xmlHit.compression || null,
        };
        result.project = parseProjectXmlPreview(xmlHit.xml);
        result.warnings = result.warnings.filter((warning) => !/did not find embedded Project XML/i.test(warning));
      }
    } catch (error) {
      result.warnings.push(`Compressed XML scan failed: ${error.message || error}`);
    }
    return result;
  }

  function readBuffer(buffer, fileName = "project.mpp", options = {}) {
    const bytes = new Uint8Array(buffer);
    const result = {
      readerVersion: VERSION,
      fileName,
      fileSize: bytes.length,
      native: true,
      mppContainerRead: false,
      metadata: {},
      streams: [],
      embeddedXml: null,
      projectXml: null,
      project: null,
      candidateStrings: [],
      dateHints: [],
      draftProject: null,
      warnings: [],
    };

    const directBytes = bytes.slice(0, Math.min(bytes.length, 8 * 1024 * 1024));
    for (const directText of decodeLikelyText(directBytes)) {
      const directXml = extractXmlFromText(directText);
      if (directXml) {
        result.projectXml = directXml;
        result.embeddedXml = { stream: "file", size: directXml.length };
        result.project = parseProjectXmlPreview(directXml);
        return result;
      }
    }

    if (!hasSignature(bytes, CFB_SIGNATURE)) {
      throw new Error("This file is not an OLE/CFB native MPP file and does not contain Project XML.");
    }

    const cfb = new CompoundFileBinary(buffer);
    result.mppContainerRead = true;
    result.sectorSize = cfb.sectorSize;
    result.miniSectorSize = cfb.miniSectorSize;
    result.streams = cfb.listStreams();
    result.metadata = extractMetadata(cfb);

    const xmlHit = options.skipDeepXml ? null : findEmbeddedProjectXml(cfb);
    if (xmlHit) {
      result.projectXml = xmlHit.xml;
      result.embeddedXml = { stream: xmlHit.stream, size: xmlHit.xml.length };
      result.project = parseProjectXmlPreview(xmlHit.xml);
      return result;
    }

    result.candidateStrings = extractCandidateStrings(cfb);
    result.dateHints = extractDateHints(cfb);
    result.draftProject = buildDraftProject(fileName, result.metadata, result.candidateStrings, result.dateHints);
    result.recoveryStats = {
      candidateCount: result.candidateStrings.length,
      dateHintCount: result.dateHints.length,
      topStream: result.draftProject?.topStream || null,
      draftTaskCount: result.draftProject?.taskCount || 0,
    };

    result.warnings.push("The browser parsed the native MPP compound-file container, but this reader did not find embedded Project XML. Full private binary task-table decoding is still not implemented.");
    if (result.draftProject?.taskCount) {
      result.warnings.push("A best-effort draft task list is available from recovered text strings. Treat it as a starting point, not a faithful MPP import.");
    }
    return result;
  }

  window.NativeMppReader = {
    read,
    readBuffer,
    readBufferAsync,
    buildDiagnostics,
    CompoundFileBinary,
    version: VERSION,
  };
})();
