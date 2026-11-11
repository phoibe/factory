// The « Machine des tâches » line of the settings (issue #271), from the dev server check's status file.
// `hash`: the project's key in that file (repoKey); `project`: its own setting, `default` follows `general`.
export function machineLine({ status, hash, isPrivate, general, project }) {
  if (!isPrivate) return { text: 'Projet public : ses tâches tournent toujours sur les machines GitHub, gratuites pour lui.', tone: 'muted' };
  const wanted = project === 'default' ? general : project;
  if (wanted === 'github') return { text: 'Ses tâches tournent sur les machines GitHub, comme demandé.', tone: 'muted' };
  if (!status) return { text: 'Serveur de dev : pas encore vérifié, machines GitHub en attendant.', tone: 'muted' };
  const entry = status.projects?.[hash];
  // A key that worked before may have left the project on the server: without it, the factory can no longer move it.
  if (status.key !== 'ok' && (status.key === 'refused' || entry?.machine === 'dev-server')) {
    return { text: "Serveur de dev : clé d'accès manquante (expirée ou refusée). Plus de secours automatique sur les machines GitHub : renouvelez la clé.", tone: 'warn' };
  }
  if (status.key !== 'ok') return { text: "Serveur de dev : clé d'accès manquante. Les tâches tournent sur les machines GitHub.", tone: 'warn' };
  if (entry?.error) return { text: "Serveur de dev : la bascule n'a pas pu se faire, nouvel essai au prochain contrôle (15 minutes au plus).", tone: 'warn' };
  const reason = entry?.reason;
  if (reason === 'online') return { text: 'Serveur de dev : en ligne.', tone: 'ok' };
  if (reason === 'offline') return { text: 'Serveur de dev : hors ligne, GitHub en secours.', tone: 'warn' };
  return { text: 'Serveur de dev : réglage pris en compte au prochain contrôle, dans 15 minutes au plus.', tone: 'muted' };
}

// A project's key in the status file, which lives on a public branch: a hash of the repository's id (never its name,
// which could be guessed and checked against the hash), so private projects never show.
export async function repoKey(fullName) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(fullName).toLowerCase()));
  return [...new Uint8Array(bytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
