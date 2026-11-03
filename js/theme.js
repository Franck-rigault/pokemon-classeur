// Thème sombre / clair : mémorisé sur cet appareil (la valeur est aussi appliquée par un petit script dans index.html, avant l'affichage)
const CLE = "classeur:theme";

export function themeCourant() {
  try {
    return localStorage.getItem(CLE) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function appliquerTheme(theme = themeCourant()) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  return theme;
}

export function basculerTheme() {
  const suivant = themeCourant() === "light" ? "dark" : "light";
  try {
    localStorage.setItem(CLE, suivant);
  } catch {
    // stockage indisponible : le thème vaut pour cette session seulement
  }
  return appliquerTheme(suivant);
}

export const libelleTheme = () => (themeCourant() === "light" ? "🌙 Passer au thème sombre" : "☀️ Passer au thème clair");
