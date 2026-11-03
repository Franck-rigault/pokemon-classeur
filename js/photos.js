// Redimensionne une photo (JPEG, 800 px max) avant de l'enregistrer : quelques dizaines de Ko au lieu de plusieurs Mo.
export function reduirePhoto(fichier, maxi = 800, qualite = 0.72) {
  return new Promise((resolve, rejet) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const echelle = Math.min(1, maxi / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * echelle));
      c.height = Math.max(1, Math.round(img.naturalHeight * echelle));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", qualite));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rejet(new Error("Cette image ne peut pas être lue.")); };
    img.src = url;
  });
}
