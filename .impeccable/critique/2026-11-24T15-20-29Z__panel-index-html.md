---
target: panel « Suivi » (branche issue-561, marquage des fichiers par version)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:f819dcfc45f0ad79a52f15d91e553abd73cd39adab2c36d99b0bfa526dfde30d"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T15-20-29Z
slug: panel-index-html
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; A finished and recorded before detector output was read)

# Critique : tableau « Suivi » après le marquage des fichiers par version (branche claude/issue-561-build-stamp)

Cible : `panel/index.html` (onglet « Suivi » et en-tête du projet). La branche ne change que les adresses des fichiers (`style.css?v=60` et `app.mjs?v=86` retirés ; à la publication, chaque fichier reçoit `?v=<commit>` via `scripts/stamp-panel.mjs`). Aucun changement de style, de texte ni de mise en page.
Rendu : banc `e2e/fixture.mjs` (faux GitHub), site construit par `buildSite` comme à la publication, et le même panneau servi depuis ses sources ; Chromium 390 × 844 et 1280 × 900, clair et sombre, menu « Plus » ouvert sur téléphone.
Vérifications : aucune erreur de page ; feuille de style chargée en `style.css?v=a1b2…` (publié) et `style.css` (sources) ; captures publiées et sources identiques au pixel près (PSNR 82 dB téléphone, 102 dB ordinateur ; les seuls écarts viennent de l'horloge « à jour à l'instant »). Les 8 réponses 404 de la console sont les mêmes dans les deux cas (adresses GitHub que le faux GitHub ne sert pas).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | « En direct · à jour à l'instant », étape 3/6 et fourchette de temps sur chaque carte |
| 2 | Match System / Real World | 3 | Français simple partout ; « Review générale », « Stack technique » restent anglais |
| 3 | User Control and Freedom | 3 | Onglets, menu « Plus » qui se referme ; rien de piégeant sur cet écran |
| 4 | Consistency and Standards | 2 | Liens de la ligne d'état de deux tailles ; nombres hors mono ; boutons factory gris dans « Plus » |
| 5 | Error Prevention | 3 | Actions lourdes derrière des fenêtres ; rien à saisir ici |
| 6 | Recognition Rather Than Recall | 3 | Tout visible sur ordinateur ; sur téléphone 9 entrées sous « Plus » |
| 7 | Flexibility and Efficiency | 2 | Un seul chemin par action, pas de raccourci ; acceptable pour un suivi |
| 8 | Aesthetic and Minimalist Design | 3 | Calme, une seule voix ; rangée de 5 boutons d'action sur ordinateur un peu dense |
| 9 | Error Recovery | 3 | Erreurs connues : message permanent + « Réessayer » (non provoquées ici) |
| 10 | Help and Documentation | 3 | Aucun texte d'explication ; une phrase sur la section vide, conforme |
| **Total** | | **28/40** | **Bon** |

## Design Specificity Verdict

**LLM assessment** : l'écran reste propre au produit : « Rien ne vous attend » en tête, sections dans l'ordre fixe de DESIGN.md (À vous / agents / file / Terminé), cartes de même taille avec barre d'étapes, aucun bleu quand rien n'attend (règle « une seule voix » respectée). La mise en page suit « Projet » et « Tableau de suivi » de la partie « Mises en page » : barre du haut à droite (Outils Mac, Sur mon téléphone, Réglages généraux, Se déconnecter en dernier ; « Déclarer stable » absent car rien n'attend), liste des projets de 240 px collée à droite, contenu ≤ 1100 px, « Nouvelle fonctionnalité » détaché ; sur téléphone « Nouvelle fonctionnalité » + « Plus », une carte par ligne. Rien d'interchangeable ajouté ni retiré par la branche.

**Deterministic scan** : `impeccable detect --json panel/index.html` → 4 constats, identiques à la critique précédente : `overused-font` (Geist, imposé par DESIGN.md : faux positif, le brief gagne), `broken-image` (`<img>` dont la source est posée plus tard en JS : faux positif), 2 × `pulsing-dot` (points « écrit… » de la discussion, onglet Agent : hors de cet écran). Aucun ne touche les lignes modifiées par la branche.

**Visual overlays** : détecteur injecté dans la page rendue (politique de sécurité retirée pour l'injection ; chargement depuis le serveur local bloqué par Chromium, contenu identique injecté directement). Téléphone et ordinateur : 1 constat chacun, `overused-font` (Geist, 86 % du texte). Pas d'onglet [Human] laissé ouvert (navigateur sans tête).

## Overall Impression

Rendu inchangé : l'écran publié avec ses fichiers marqués est identique à celui d'avant. La branche ne crée aucun défaut visible. Ce qui reste à reprendre est ancien : de petites incohérences de taille et de police dans l'en-tête et sur les cartes, et le menu « Plus » du téléphone.

## What's Working

- Une seule voix : sans demande en attente, aucun bleu ; le point vert « En direct » est accompagné de mots.
- Les sections suivent exactement l'ordre et la grille décrits dans « Mises en page » ; la section vide dit une seule phrase dans un cadre en pointillés.
- Le sombre garde le même calme ; filets et cartes lisibles.

## Priority Issues

- **[P2] Ligne de liens de deux tailles** (pré-existant) : « Ajouter l'adresse du site en ligne » est en taille normale, « Voir les demandes sur GitHub (4) » et « Aucun agent lancé aujourd'hui » plus petits, sur la même ligne séparée par « · ». L'œil y lit deux niveaux qui n'existent pas. **Fix** : une seule taille pour les trois liens. **Suggested command** : /impeccable typeset
- **[P2] Menu « Plus » du téléphone : boutons factory qui semblent désactivés** (pré-existant, déjà signalé le 24/11) : « Outils Mac », « Réglages généraux », « Se déconnecter » en gris à côté des actions du projet en encre ; 3 liens + 7 boutons sans séparation entre « ce projet » et « la factory ». **Fix** : texte encre pour tous les boutons du menu, un filet entre les deux groupes. **Suggested command** : /impeccable layout
- **[P3] Mono mal dosé sur les cartes** (pré-existant) : « Entre 31  min et 1  h 03 » : les chiffres en mono laissent des blancs irréguliers autour de « min » et « h » ; à l'inverse « (4) », « 1 en travail · 1 en file » ne sont pas en mono (règle « Mono Numbers »). **Fix** : n'appliquer le mono qu'aux nombres, sans espace fine doublée, et l'étendre aux nombres de la ligne d'état et de la carte calme. **Suggested command** : /impeccable typeset

## Persona Red Flags

**Pierre (propriétaire, sur téléphone, ne lit pas de code)** : il voit « Rien ne vous attend » d'un coup d'œil, c'est bon. En ouvrant « Plus », trois boutons gris lui semblent indisponibles ; « Review générale » et « Stack technique » sont des mots anglais au premier niveau.

**Sam (clavier, lecteur d'écran)** : onglets et boutons ont l'anneau encre ; « Plus » est un `<details>` sans rôle de bouton annoncé comme tel (un lecteur d'écran dit « disclosure », acceptable). Rien de modifié par la branche.

**Riley (cas limites)** : la branche corrige justement le cas « page ancienne + fichiers nouveaux » après une mise à jour ; à l'écran, rien ne change. Les 404 en console viennent du faux GitHub, pas du marquage.

## Minor Observations

- Sur la capture pleine page de l'ordinateur, la colonne « Projets » s'arrête à la hauteur de la fenêtre ; à l'usage, elle reste collée en défilant (artefact de capture).
- « Prise en charge imminente » et « Étape 3/6 · Construction » disent deux états proches sur la même carte (pré-existant).
- Aucun texte d'explication sur l'écran : conforme à la règle « Textes à l'écran ».
- La branche ajoute `<meta name="build">` au site publié : invisible, sans effet sur le rendu.

## Questions to Consider

- Les trois boutons « factory » du menu « Plus » devraient-ils vivre dans « Réglages généraux » plutôt qu'à côté des actions du projet ?
- La ligne de liens a-t-elle besoin de trois entrées sur téléphone, ou l'état seul suffit-il ?
