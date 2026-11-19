/* ============================================================
   RÉGLAGES DU SITE TOTAL90 — le seul fichier à modifier vous-même.
   Remplissez les champs entre guillemets, puis renvoyez ce fichier sur GitHub.
   ============================================================ */
window.T90_CONFIG = {
  siteName: "TOTAL90",
  siteUrl: "https://total-90.netlify.app",

  // Éditeur du site (obligatoire en France, loi pour la confiance dans l'économie numérique).
  // Particulier sans activité commerciale : vous pouvez laisser l'adresse vide, mais votre nom et
  // votre adresse doivent alors être communiqués à l'hébergeur (Netlify) via votre compte.
  editor: {
    name: "",            // ex. "Hicham Aouam"
    status: "particulier", // "particulier" ou "entreprise"
    company: "",         // si entreprise : raison sociale, forme, capital, RCS/SIRET
    address: "",
    email: "",           // adresse de contact affichée sur le site
    publicationDirector: "" // directeur de la publication (souvent vous-même)
  },

  // Hébergeur : vérifiez l'adresse exacte sur https://www.netlify.com (rubrique légale) avant publication.
  host: { name: "Netlify, Inc.", address: "San Francisco, Californie, États-Unis", website: "https://www.netlify.com" },

  // Publicité : désactivée. À n'activer qu'après avoir lu la section « Monétisation » du LISEZ-MOI.
  // cmp: "google" = utiliser la fenêtre de consentement certifiée de Google (obligatoire pour AdSense en Europe,
  // à activer dans AdSense > Confidentialité et messages). TOTAL90 n'affiche alors pas la sienne.
  ads: { enabled: false, provider: "adsense", client: "" /* ex. "ca-pub-1234567890123456" */, cmp: "google" },

  // Mesure d'audience : désactivée.
  analytics: { enabled: false }
};
