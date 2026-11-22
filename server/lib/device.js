// Helper library: turns a browser's User-Agent text into a short label
// such as "Chrome on macOS" for the account page's session list.

/**
 * @param {string} ua the User-Agent header
 * @returns {string} e.g. "Firefox on Windows", or "Unknown device"
 */
function describeDevice(ua = '') {
  // Order matters: Edge and Opera also contain "Chrome", and Chrome also contains "Safari".
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (!browser && !os) return 'Unknown device';
  return `${browser ?? 'Browser'}${os ? ` on ${os}` : ''}`;
}

module.exports = { describeDevice };
