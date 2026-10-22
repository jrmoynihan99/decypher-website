/**
 * A ZIP archive written one entry at a time, every entry stored — no
 * compression, so each file comes out of the archive byte for byte as it
 * went in (PDFs are compressed already; deflating them again saves little).
 * Built for streaming: `entry` returns the bytes to send for one file, `end`
 * the central directory once all are in, so a response can start before
 * the archive is whole.
 *
 * Plain ZIP (no ZIP64): fine under 4 GB and 65,535 entries. Names are
 * flagged UTF-8 (general purpose bit 11) and made unique.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date fields for a moment, local to the server. */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8 = 0x0800;
const VERSION = 20;

export function storedZip(now = new Date()) {
  const { time, date } = dosTime(now);
  const central: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;
  let count = 0;

  /** "a.pdf" twice becomes "a.pdf" and "a (2).pdf". */
  const unique = (name: string) => {
    const clean = name.replace(/[\\/]+/g, "_").trim() || "file";
    let out = clean;
    for (let n = 2; used.has(out.toLowerCase()); n++) {
      const dot = clean.lastIndexOf(".");
      out = dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
    }
    used.add(out.toLowerCase());
    return out;
  };

  return {
    /** The local header and the data for one file, in that order. */
    entry(name: string, bytes: Uint8Array): Buffer[] {
      const fileName = Buffer.from(unique(name), "utf8");
      const crc = crc32(bytes);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(VERSION, 4);
      local.writeUInt16LE(UTF8, 6);
      local.writeUInt16LE(0, 8); // stored
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(bytes.length, 18);
      local.writeUInt32LE(bytes.length, 22);
      local.writeUInt16LE(fileName.length, 26);
      local.writeUInt16LE(0, 28);

      const dir = Buffer.alloc(46);
      dir.writeUInt32LE(0x02014b50, 0);
      dir.writeUInt16LE(VERSION, 4);
      dir.writeUInt16LE(VERSION, 6);
      dir.writeUInt16LE(UTF8, 8);
      dir.writeUInt16LE(0, 10);
      dir.writeUInt16LE(time, 12);
      dir.writeUInt16LE(date, 14);
      dir.writeUInt32LE(crc, 16);
      dir.writeUInt32LE(bytes.length, 20);
      dir.writeUInt32LE(bytes.length, 24);
      dir.writeUInt16LE(fileName.length, 28);
      dir.writeUInt16LE(0, 30); // extra
      dir.writeUInt16LE(0, 32); // comment
      dir.writeUInt16LE(0, 34); // disk
      dir.writeUInt16LE(0, 36); // internal attributes
      dir.writeUInt32LE(0, 38); // external attributes
      dir.writeUInt32LE(offset, 42);
      central.push(dir, fileName);

      offset += local.length + fileName.length + bytes.length;
      count++;
      return [local, fileName, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)];
    },
    /** The central directory and its end record: the archive's last bytes. */
    end(): Buffer {
      const dir = Buffer.concat(central);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4);
      eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(count, 8);
      eocd.writeUInt16LE(count, 10);
      eocd.writeUInt32LE(dir.length, 12);
      eocd.writeUInt32LE(offset, 16);
      eocd.writeUInt16LE(0, 20);
      return Buffer.concat([dir, eocd]);
    },
  };
}
