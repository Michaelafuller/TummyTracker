// Local primary-key generation. This is a single-user, on-device journal, so PKs
// need to be unique, not cryptographically unguessable — a Math.random v4-style
// UUID is more than sufficient and avoids a native crypto dependency.

const UUID_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

export function createId(): string {
  return UUID_TEMPLATE.replace(/[xy]/g, (char) => {
    const r = (Math.random() * 16) | 0;
    const value = char === 'x' ? r : (r & 0x3) | 0x8;
    return value.toString(16);
  });
}
