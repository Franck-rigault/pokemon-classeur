// Effets du jeu : bruitages générés dans le navigateur (aucun fichier audio) et vibrations.

let contexte = null;

export function sonActif() {
  try {
    return localStorage.getItem("jeu:son") !== "0";
  } catch {
    return true;
  }
}

export function basculerSon() {
  const actif = !sonActif();
  try {
    localStorage.setItem("jeu:son", actif ? "1" : "0");
  } catch {
    // préférence non mémorisée
  }
  return actif;
}

function audio() {
  if (!contexte) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    contexte = new AC();
  }
  if (contexte.state === "suspended") contexte.resume();
  return contexte;
}

function note(c, frequence, duree, type, volume, debut) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = frequence;
  const t = c.currentTime + debut;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + duree + 0.02);
}

function bruit(c, duree, volume) {
  const taille = Math.floor(c.sampleRate * duree);
  const tampon = c.createBuffer(1, taille, c.sampleRate);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < taille; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / taille);
  const source = c.createBufferSource();
  source.buffer = tampon;
  const filtre = c.createBiquadFilter();
  filtre.type = "bandpass";
  filtre.frequency.value = 2500;
  const g = c.createGain();
  g.gain.value = volume;
  source.connect(filtre).connect(g).connect(c.destination);
  source.start();
}

// nom : dechirure | carte | bon | hit | jackpot
export function son(nom) {
  if (!sonActif()) return;
  const c = audio();
  if (!c) return;
  if (nom === "dechirure") bruit(c, 0.55, 0.35);
  else if (nom === "carte") note(c, 420, 0.1, "sine", 0.12, 0);
  else if (nom === "bon") [523, 659, 784].forEach((f, i) => note(c, f, 0.16, "triangle", 0.16, i * 0.08));
  else if (nom === "hit") [523, 659, 784, 1046].forEach((f, i) => note(c, f, 0.2, "triangle", 0.2, i * 0.08));
  else if (nom === "jackpot") {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => note(c, f, 0.28, "triangle", 0.22, i * 0.09));
    [1046, 1318, 1568, 2093].forEach((f, i) => note(c, f, 0.5, "sine", 0.1, 0.55 + i * 0.07));
  }
}

export function vibrer(motif) {
  try {
    if (navigator.vibrate) navigator.vibrate(motif);
  } catch {
    // vibration indisponible
  }
}
