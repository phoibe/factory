---
target: panel header « Déclarer stable » button
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:5e979432e9ad8d52a8f4b6c7908a66f481ba26bcfb83bb3dc46f31bb54fc1a3e"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T11-33-26Z
slug: panel-index-html
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; A finished and recorded before detector output was read)

# Critique : bouton « Déclarer stable » de la barre du haut (commit 7e84cc8, issue #551)

Cible : `panel/index.html` (bouton `#stable`, ligne 18) et `panel/app.mjs` `refreshStable` (~2116), `panel/lib.mjs` `stableView`.
Rendu : panneau servi par le banc `e2e/fixture.mjs` (faux GitHub), comparaison `stable...main` simulée ; Chromium 390 px (menu « Plus » ouvert) et 1280 px, clair et sombre, deviceScaleFactor 1.
Cas vus : 2 vraies modifications + 3 `chore(factory)` → « Déclarer stable (2) » visible ; seulement des `chore(factory)` → bouton absent (ordinateur et menu « Plus » du téléphone).
Note : l'arbre de travail contient une modification non commitée de `stableView` (liste tronquée → bouton gardé) ; le rendu l'inclut et le problème n°1 la concerne.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Le nombre dit enfin la vérité (2 = 2 lignes dans la confirmation) ; mais liste tronquée → « (0) » visible |
| 2 | Match System / Real World | 2 | La confirmation montre les sujets de commit bruts (« fix(panel): … (#550) », « feat: … ») |
| 3 | User Control and Freedom | 3 | Confirmation avec Annuler ; bouton désactivé pendant l'envoi |
| 4 | Consistency and Standards | 2 | `confirm()` natif au lieu de la « Fenêtre » du design ; « (2) » pas en mono ; bouton absent de DESIGN.md « Mises en page » |
| 5 | Error Prevention | 3 | Plus de bouton pour rien ; confirmation avant l'action |
| 6 | Recognition Rather Than Recall | 3 | Liste des changements montrée avant de valider ; sur téléphone, noyé dans « Plus » |
| 7 | Flexibility and Efficiency | 2 | Un seul chemin ; acceptable pour une action rare |
| 8 | Aesthetic and Minimalist Design | 3 | Bouton discret qui disparaît quand rien n'attend ; menu « Plus » chargé autour |
| 9 | Error Recovery | 3 | Toast « Impossible de déclarer stable. … » |
| 10 | Help and Documentation | 3 | Aucun texte d'explication (conforme à la règle) ; libellé suffit pour le propriétaire |
| **Total** | | **27/40** | **Bon, détails à reprendre** |

## Design Specificity Verdict

**LLM assessment** : le changement est juste dans son principe et propre au produit : le panneau ne signale plus une « version à déclarer » quand seule la factory elle-même a bougé, ce qui colle à « le panneau montre ce qui attend la réponse de Pierre ». Le bouton reste discret (ghost gris, 44 px, jamais bleu), cohérent avec la règle « une seule voix ». Rien de générique ajouté. Le point faible est en aval : la fenêtre de confirmation montre le jargon des commits.

**Deterministic scan** : `impeccable detect --json panel/index.html` → 4 constats, aucun sur la barre du haut : `overused-font` (Geist, imposé par DESIGN.md : faux positif, le brief gagne), `broken-image` (`<img>` sans src rempli plus tard en JS : faux positif), 2 × `pulsing-dot` (points « écrit… » de la discussion : hors périmètre).

**Visual overlays** : détecteur injecté dans la page rendue (CSP retirée pour l'injection). Ordinateur : 1 constat (police Geist). Téléphone, menu « Plus » ouvert : 8 constats, dont 7 « text occluded » causés par le menu déroulant posé sur la page : comportement voulu d'un menu, faux positif. Rien sur le bouton « Déclarer stable ». Pas d'onglet [Human] laissé ouvert (navigateur sans tête).

## Overall Impression

Correctif sain : le bouton n'apparaît que pour de vraies modifications et son nombre correspond à la liste de la confirmation. La plus grosse marge restante est la confirmation elle-même (jargon, fenêtre native) et un cas limite où le bouton s'affiche avec « (0) ».

## What's Working

- Le bouton disparaît quand seuls des `chore(factory)` attendent : moins de bruit, aucune action inutile proposée.
- Le nombre « (N) » et la liste de la confirmation viennent de la même source : plus d'écart « (5) » contre 2 lignes.
- Style inchangé et conforme : bouton discret, 44 px, contraste AA (#5f6368 sur blanc ≈ 6,3:1 ; #9aa0a6 sur #18191c en sombre).

## Priority Issues

- **[P2] « Déclarer stable (0) » visible quand la liste GitHub est tronquée** (dans le périmètre ; vient de la modification non commitée de `stableView`) : si plus de 250 commits attendent et que ceux reçus sont tous `chore(factory)`, le bouton reste affiché avec « (0) » et une confirmation sans aucune ligne. Le libellé se contredit. Rare, mais c'est exactement ce que l'issue voulait éviter. **Fix** : dans ce cas, afficher le bouton sans nombre (« Déclarer stable ») ou « (250+) », et une ligne « Liste trop longue pour être affichée » dans la confirmation. **Suggested command** : /impeccable harden
- **[P2] La confirmation montre du jargon technique** (pré-existant, mais c'est l'écran ouvert par ce bouton) : « • fix(panel): bouton plus clair (#550) », « • feat: réglages généraux (#544) ». DESIGN.md interdit le jargon au premier niveau. De plus, `slice(-8)` montre au plus 8 lignes alors que le bouton annonce par exemple « (12) », sans le dire. **Fix** : retirer le préfixe `type(portée):` et le « (#n) », et ajouter « … et 4 autres » au-delà de 8. **Suggested command** : /impeccable clarify
- **[P2] Fenêtre `confirm()` native** (pré-existant) : boîte du navigateur, hors du modèle « Fenêtre » de DESIGN.md (titre, contenu, boutons en bas à droite, Échap). Sur téléphone, elle affiche l'adresse du site en titre. **Fix** : utiliser la fenêtre `<dialog>` du panneau avec « Annuler » / « Déclarer stable ». **Suggested command** : /impeccable polish
- **[P2] Menu « Plus » du téléphone chargé, boutons factory qui semblent désactivés** (pré-existant, ailleurs dans l'en-tête) : 12 entrées (3 liens + 9 boutons). « Outils Mac », « Déclarer stable (2) », « Réglages généraux », « Se déconnecter » sont en gris discret à côté des actions du projet en encre : ils ont l'air grisés, donc inactifs. **Fix** : un filet séparateur entre « ce projet » et « la factory », et le texte en encre pour tous les boutons du menu. **Suggested command** : /impeccable layout
- **[P3] La barre du haut bouge à l'apparition du bouton** (dans le périmètre : visibilité) : le bouton arrive après le tableau (jusqu'à 8 s) et décale vers la gauche « Outils Mac » dans la barre alignée à droite. **Fix** : placer « Déclarer stable » en dernier avant « Se déconnecter », ou accepter (action rare). **Suggested command** : /impeccable polish

## Persona Red Flags

**Pierre (propriétaire, ne lit pas de code, sur téléphone)** : il ouvre « Plus » et trouve « Déclarer stable (2) » en gris parmi 12 entrées. Il le touche : une boîte du navigateur montre « fix(panel): … (#550) », des mots qu'il ne lit pas. Il doit faire confiance sans comprendre ce qu'il valide. S'il voit un jour « (0) », il ne saura pas s'il faut appuyer.

**Casey (sur téléphone, distrait)** : le bouton est au fond du menu, sous 6 autres entrées ; les boutons gris font croire qu'ils sont désactivés. La boîte native peut se fermer par erreur en changeant d'application.

**Riley (cas limites)** : plus de 250 commits en attente → « (0) » visible ; plus de 8 changements → la liste en montre 8 sans le signaler ; échec de lecture de la comparaison → le bouton reste caché sans rien dire (acceptable : il n'y a rien à faire).

## Minor Observations

- « (2) » est en Geist et non en Geist Mono (règle « Mono Numbers »). Même chose pour « Voir les demandes sur GitHub (2) » (pré-existant).
- DESIGN.md, « Mises en page » → « Projet » : la barre du haut liste quatre boutons et ne cite pas « Déclarer stable » (écart de documentation, pré-existant).
- Le toast « Tests en cours : la version stable sera prête dans 2 minutes environ » est un message d'état, pas une explication : conforme à la règle.
- Aucun texte d'explication ajouté par le changement : conforme.
- Le DOM garde « Déclarer stable (0) » sur le bouton caché : sans effet visible.

## Questions to Consider

- La confirmation devrait-elle parler en phrases de propriétaire (titres des demandes livrées) plutôt qu'en sujets de commit ?
- « Déclarer stable » a-t-il sa place parmi les actions d'un projet, alors qu'il concerne toute la factory ?
