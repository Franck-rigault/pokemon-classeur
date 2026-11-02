// Fonctions de texte sans dépendance au navigateur (utilisables aussi dans les scripts Node).

export const normalise = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
