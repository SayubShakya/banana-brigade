// A short, readable name for the device from its User-Agent header, e.g.
// "Chrome on macOS", for the "where you're signed in" list. Only this short name is
// kept, not the whole header.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

function describeDevice(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (!browser && !os) return 'Unknown device';
  return `${browser ?? 'Browser'}${os ? ` on ${os}` : ''}`;
}

module.exports = { describeDevice };
