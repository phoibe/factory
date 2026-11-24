---
target: "tableau Suivi du panneau (#557)"
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/factory/panel/index.html"
target_fingerprint: "sha256:1e4c3d37823f48e4c988c2c1ca3856ffa816de56d8318199be3436ef5a175c1c"
target_path: /home/user/factory/panel/index.html
timestamp: 2026-11-24T14-55-52Z
slug: panel-index-html
---
# Critique — tableau « Suivi » du panneau, après le filtre de confiance (issue #557)

⚠️ DEGRADED: single-context (aucun outil de sous-agent exposé à ce sous-agent : évaluations A puis B faites à la suite, A terminée avant la lecture du détecteur)

Cible : `panel/index.html` + `panel/app.mjs`, onglet « Suivi » (tableau principal). Mode : Operate.
Rappel appliqué : règle « Textes à l'écran » (aucun texte qui explique le fonctionnement de l'écran).

Changement de la branche : les réponses de GitHub passent par `trustRead` (notes de la factory retirées des
demandes de personnes extérieures sur un projet public) et `app.mjs?v=87`. Rien ne doit changer à l'écran.

## Comparaison avec `main`

Panneau servi par `e2e/fixture.mjs` (faux GitHub), même jeu de cartes (À vous, agents au travail, file d'attente
dont une demande d'une personne extérieure, Terminé vide), projet privé et projet public, ordinateur 1440×900 et
téléphone 390×844, captures pleine page. Les 4 captures de la branche sont **identiques octet pour octet** à celles
de `main` (worktree d'`origin/main`). Aucune régression visuelle.

## Score de santé (Nielsen) — 30/40

| # | Heuristique | Score | Point clé |
|---|---|---|---|
| 1 | État du système | 4 | Point « En direct », étape n/6 et barre de progression sur chaque carte |
| 2 | Monde réel | 3 | Français simple ; « Étape 3/6 · Construction à venir » sur une carte en file reste un peu technique |
| 3 | Contrôle | 3 | Une action par carte, rien d'irréversible sur le tableau |
| 4 | Cohérence | 3 | Chiffres en mono au milieu des phrases (« Entre 31 min et 1 h 03 ») : espacement irrégulier |
| 5 | Prévention des erreurs | 3 | Rien à signaler sur le tableau |
| 6 | Reconnaissance | 3 | Sections fixes, nombre en puce |
| 7 | Flexibilité | 2 | Aucun raccourci clavier |
| 8 | Esthétique, minimalisme | 3 | Sur ordinateur, 9 boutons encadrés au-dessus de la carte « À vous » |
| 9 | Récupération d'erreur | 3 | Non exercé ici, messages courts existants |
| 10 | Aide | 3 | Aucun texte explicatif, conforme à la règle |
| **Total** | | **30/40** | **Bon** |

## Spécificité du design

Évaluation : le tableau suit sa mise en page de `DESIGN.md` (sections empilées, nombre en puce mono, cartes de
280 px au moins, « Rien de livré pour l'instant. » en pointillés, une carte par ligne au téléphone). Rien de générique
ajouté. Détecteur (`impeccable detect`, `panel/index.html` + `panel/app.mjs`) : 5 alertes, toutes antérieures et sans
lien avec #557 — `broken-image` (image de la visionneuse, source posée à l'ouverture), `overused-font` (Geist,
choix validé), `pulsing-dot` ×2 (points « l'agent réfléchit »), `design-system-radius` (`app.mjs` l. 3425,
8 px). Superposition dans le navigateur non injectée (passe dégradée).

## Ce qui marche

- La carte « À vous de jouer » ressort seule (fond bleu clair, bouton « go » plein) : ce qui attend Pierre se voit d'un coup d'œil.
- La barre d'étapes donne l'avancement sans texte.
- Aucun texte explicatif à l'écran.

## Problèmes prioritaires (tous antérieurs à la branche, hors périmètre de #557)

- **[P1] Bouton « go » de 32 px de haut au téléphone (107 px de large)** : sous les 44 px de `PRODUCT.md`, et
  `DESIGN.md` veut les boutons de carte en pleine largeur au téléphone. Correction : hauteur 44 px et pleine largeur
  sous la largeur téléphone. Commande : `/impeccable adapt`.
- **[P2] Chiffres en mono dans les phrases des cartes** (« Ensuite ~56 min », « Entre 31 min et 1 h 03 ») : les
  espaces autour des chiffres paraissent cassés. Correction : chiffres tabulaires de Geist au lieu de la police mono
  dans le texte courant (garder la mono pour les puces de nombre). Commande : `/impeccable typeset`.
- **[P2] Neuf boutons encadrés au-dessus de la première carte sur ordinateur** (4 en barre du haut, 5 d'action) :
  ils pèsent autant que l'action attendue. Correction : boutons de la barre du haut en style lien discret.
  Commande : `/impeccable quieter`.

## Alertes des personas

- **Pierre au téléphone** : le « go » de 32 px se rate au pouce.
- **Alex (habitué)** : pas de raccourci pour ouvrir la carte « À vous ».

## Observations mineures

- Liste « Projets » : son fond s'arrête à la hauteur de la fenêtre sur une capture pleine page (colonne collée) ; sans effet en usage réel.
- Une demande en `factory:screenshots` sans PR n'apparaît pas sur le tableau (donnée de test) : même chose sur `main`.

Questions skipped: run autonome de la factory
