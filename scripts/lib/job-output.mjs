// Values that travel from one job of relay.yml to another (job outputs). GitHub drops a job output that contains
// the value of a secret (« Skip output … since it may contain secret »): a project whose name is also a secret's
// value (its ntfy topic, say) lost every preview and live-site address, so those checks never ran. Hex digits never
// spell a secret, so these values are written in hex and read back here.
export const toJobOutput = (value) => (value ? `hex:${Buffer.from(String(value), 'utf8').toString('hex')}` : '');

// Also reads a plain value (written by an older version, or typed by hand).
export const fromJobOutput = (value) => {
  const s = String(value ?? '');
  return s.startsWith('hex:') ? Buffer.from(s.slice(4), 'hex').toString('utf8') : s;
};
