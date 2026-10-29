// Privacy and Terms pages, readable without an account. Privacy says exactly what
// the session cookie (brigade.sid) and the server store, and for how long.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

export function Privacy({ onBack }) {
  return (
    <Panel wide title="Privacy" subtitle="What Banana Brigade stores about you, and for how long."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="legal">
        <h3>The one cookie: <code>brigade.sid</code></h3>
        <p>When you log in, the server sets one cookie. It holds only a random session id, signed so it cannot be
          changed. It is <b>HttpOnly</b> (page scripts cannot read it), <b>SameSite=Lax</b> (not sent with requests
          from other sites) and <b>Secure</b> on HTTPS. There are no advertising or tracking cookies.</p>
        <table>
          <thead><tr><th>Stored</th><th>Where</th><th>How long</th></tr></thead>
          <tbody>
            <tr><td>Session id</td><td>The <code>brigade.sid</code> cookie in your browser</td><td>2 hours, or 30 days with "Remember me"</td></tr>
            <tr><td>Session: your user id, name, role, Banana puzzle counts, when it started, your device (browser and system) and when it was last used</td><td>MongoDB, <code>sessions</code> collection</td><td>Until you log out, or the same 2 hours / 30 days</td></tr>
            <tr><td>Account: username, bcrypt password hash (never the password), role, achievements, campaign stars, daily streak, last login</td><td>MongoDB, <code>users</code></td><td>Until you delete the account</td></tr>
            <tr><td>Match results and daily challenge results</td><td>MongoDB, <code>scores</code>, <code>dailyresults</code></td><td>Until you delete the account</td></tr>
            <tr><td>Failed login counters (name and IP address)</td><td>MongoDB, <code>ratelimits</code></td><td>10–15 minutes, then deleted automatically</td></tr>
            <tr><td>Password reset links (only a hash)</td><td>MongoDB, <code>passwordresets</code></td><td>30 minutes</td></tr>
            <tr><td>Guest accounts</td><td>MongoDB, <code>users</code></td><td>7 days unless you save it as a full account</td></tr>
            <tr><td>Settings, avatar and sound volume</td><td>Your browser's local storage (never sent to the server)</td><td>Until you clear the site data</td></tr>
          </tbody>
        </table>
        <h3>Your rights</h3>
        <p>In Settings → Account you can see every device you are signed in on and sign one out, <b>download all your data</b> as
          a JSON file, log out everywhere, and <b>delete your account</b>, which removes everything above at once.</p>
        <h3>Other services</h3>
        <p>Puzzles come from the Banana API by Marc Conrad; only our server talks to it and nothing about you is sent.
          New passwords are checked against Have I Been Pwned using only the first 5 characters of their SHA-1 hash,
          so the password itself never leaves our server. Fonts load from Google Fonts.</p>
      </div>
    </Panel>
  );
}

export function Terms({ onBack }) {
  return (
    <Panel wide title="Terms" subtitle="Short and plain."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="legal">
        <ol>
          <li>Banana Brigade is a student project for CIS046-3 Software for Enterprise at the University of Bedfordshire. It is free and comes with no guarantee that it will always be available.</li>
          <li>Pick a username that is not offensive and does not pretend to be someone else.</li>
          <li>Play fair: no cheating tools, no changing the game's requests, no attacks on the server or on other players' accounts.</li>
          <li>Admins can reset scores or suspend an account that breaks these rules. Every admin action is logged with a reason.</li>
          <li>Keep your password to yourself. If you think someone else has it, change it or use "Log out everywhere".</li>
          <li>Puzzles come from the Banana API by Marc Conrad (marcconrad.com/uob/banana) and are used as the course intends.</li>
          <li>You can delete your account at any time in Settings → Account.</li>
        </ol>
      </div>
    </Panel>
  );
}

export function NotFound({ onHome }) {
  return (
    <Panel narrow title="404" subtitle="That page does not exist."
      footer={<button className="mbtn primary" onClick={onHome}>Go to the home page</button>}>
      <p className="legal">The address <code>{location.pathname}</code> is not part of Banana Brigade. The bananas are back at base.</p>
    </Panel>
  );
}
