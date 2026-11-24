---
name: Factory
description: Un atelier monochrome, précis et aéré, où une seule couleur vive signale ce qui attend votre réponse.
colors:
  paper: "#fbfbfa"
  surface: "#ffffff"
  surface-2: "#f4f4f2"
  ink: "#0e0f11"
  muted: "#5f6368"
  line: "#e6e6e3"
  signal-blue: "#1850e8"
  signal-blue-soft: "#eaf0ff"
  ok-green: "#1a7f4b"
  danger-red: "#c62828"
  danger-bg: "#fdecea"
  scrim: "rgb(0 0 0 / .45)"
  warn-soft: "#fff4e5"
  warn-line: "#f3c58f"
  ok-soft: "#ebf6ef"
  ok-line: "#a9d8bc"
  paper-dark: "#101113"
  surface-dark: "#18191c"
  surface-2-dark: "#1d1e22"
  ink-dark: "#f2f2ef"
  muted-dark: "#9aa0a6"
  line-dark: "#2a2c30"
  signal-blue-dark: "#6c93ff"
  signal-blue-soft-dark: "#16213f"
  ok-green-dark: "#6fcf97"
  danger-red-dark: "#ff8a80"
  danger-bg-dark: "#3a1f1c"
  warn-soft-dark: "#33240f"
  warn-line-dark: "#6b4a1f"
  ok-soft-dark: "#12291c"
  ok-line-dark: "#285c3d"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card-you:
    backgroundColor: "{colors.signal-blue-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Factory

## 1. Overview

**Creative North Star: « Le plan d'architecte ».** Tout est net, rien ne dépasse. La précision de GitHub et de Vercel : beaucoup d'air, des filets fins, des chiffres alignés. Le panneau est calme parce qu'il ne montre que l'essentiel ; le détail est à un clic.

Le ressenti visé : au clair, aux commandes, serein. Jamais noyé sous les détails techniques, jamais infantilisé.

**Key Characteristics:**
- Une seule couleur vive, le bleu signal, réservée à ce qui attend une réponse.
- Tout le reste est gris, encre et papier tant que rien n'attend.
- Aéré : l'essentiel d'abord, le détail en un clic.
- Mouvement presque invisible : transitions douces, état qui change en direct.
- Le téléphone d'abord pour les actions rapides, l'ordinateur pour suivre et valider.

## 2. Colors

Un papier presque blanc le jour, un anthracite profond la nuit (automatique selon le système), une encre noire, et un bleu franc.

### Primary
- **Bleu signal** (`#1850e8`, nuit `#6c93ff`) : uniquement la carte « À vous » et son bouton « go » (exception : les boutons de connexion et de validation du jeton de lecture de la discussion). Les liens sont en encre soulignée, le bouton d'envoi de la discussion est encre. Fond doux associé (`#eaf0ff`, nuit `#16213f`).

### Neutral
- **Papier** (`#fbfbfa`, nuit `#101113`) : fond de page.
- **Surface** (`#ffffff`, nuit `#18191c`) : cartes.
- **Surface 2** (`#f4f4f2`, nuit `#1d1e22`) : un ton à côté du papier : cartes en file d'attente ou en attente de prise en compte, colonne des conversations, liste des projets (le jour), blocs de commande.
- **Encre** (`#0e0f11`, nuit `#f2f2ef`) : texte.
- **Gris discret** (`#5f6368`, nuit `#9aa0a6`) : texte secondaire.
- **Filet** (`#e6e6e3`, nuit `#2a2c30`) : bordures d'un pixel.

### Status
- **Voile** (`rgb(0 0 0 / .45)`) : derrière une fenêtre (code QR) et sur les vignettes d'images, pour détacher ce qui est devant.
- **Vert** (`#1a7f4b`, nuit `#6fcf97`) : terminé. **Rouge** (`#c62828`, nuit `#ff8a80`) : échec ; son fond doux (`#fdecea`, nuit `#3a1f1c`) teinte une carte bloquée et un message d'erreur de chargement. Toujours accompagnés d'un mot ou d'une icône, jamais seuls.

**The One Voice Rule.** Le bleu apparaît sur un seul élément principal par écran : ce qui attend la réponse. Dans la section « À vous de jouer », c'est un bouton bleu par carte (« go » pour une spec, « Ok » pour des captures ou une recette), les autres boutons de la carte restent discrets. S'il n'y a rien à répondre, il n'y a pas de bleu. Seule exception : le point d'état bleu de la liste des projets, qui signale lui aussi une réponse attendue.

## 3. Typography

**Display / corps :** Geist (repli : police système sans empattement).
**Chiffres et identifiants :** Geist Mono pour les numéros de tâches, versions, durées.

- **Display** (600, 1.75rem, interligne 1.2, -0.02em) : titre d'écran.
- **Title** (600, 1.125rem) : titres de cartes.
- **Body** (400, 1rem, interligne 1.5) : texte, une courte phrase par ligne, 65 caractères maximum.
- **Label** (mono 500, 0.8125rem) : numéros, états, métadonnées.

**The Mono Numbers Rule.** Tout numéro (#33, 2 tâches, 3 min) est en police à chasse fixe : le chiffre seul, à la taille du texte qui l'entoure ; l'unité (« min », « h ») reste dans la police du texte.

## 4. Layout

Colonne unique sur téléphone, avec la carte « À vous » en haut ; largeur maximale de 1100 px sur ordinateur. Rythme sur une échelle de 4 / 8 / 16 / 24 / 48 px, de grandes marges entre sections (48 px) et des groupes serrés à l'intérieur. Les zones tactiles font au moins 44 px, placées sous le pouce en bas de la carte.

## 5. Elevation & Depth

Plat : la profondeur vient des filets d'un pixel et du contraste papier / surface, pas des ombres. Une ombre très légère (`0 1px 2px rgb(0 0 0 / .05)`) est permise uniquement sur les éléments flottants (menus).

## 6. Shapes

Coins doucement arrondis : 6 px (champs, puces), 10 px (boutons), 14 px (cartes, bulles de discussion), et entièrement arrondis (999 px) pour les pastilles de compte et les barres de progression. Pas de formes décoratives.

## 7. Components

- **Bouton principal** : fond bleu signal, texte blanc, 44 px de haut ; un seul par écran. Survol : légère variation de teinte. Focus : anneau de 2 px encre avec 2 px de marge (le bleu reste réservé à ce qui attend une réponse) ; liens, cartes, volets repliables et zones qui défilent ont le même anneau.
- **Bouton discret** : surface, filet, texte encre ; pour toutes les autres actions.
- **Carte** : surface, filet d'un pixel, coins 14 px, marge intérieure 24 px.
- **Section « À vous de jouer »** : en tête de page, titre et nombre comme les autres sections, puis une carte par demande au même format que les autres, teintée de bleu doux (rouge si bloquée) ; chaque carte a au plus un bouton bleu (« go » ou « Ok », qui part dès le toucher), toujours en premier, sur la même ligne que les boutons discrets (un mot chacun, « Voir… ») ; tous ces boutons ont la petite taille des boutons des cartes « Prise en compte en cours… » (32 px visibles, 44 px sous le doigt). Toutes les cartes de la section ont la même taille, quel que soit leur contenu ; la barre d'étapes et le temps restant sont alignés en bas de chaque carte. Le titre de la carte s'ouvre au toucher (44 px sous le doigt), pas le fond de la carte. Quand rien n'attend, une carte calme « Rien ne vous attend » la remplace.
- **Étiquette de taille** : en haut d'une carte, la taille de la demande (« petite demande », « demande moyenne », « grande demande ») dans une puce neutre (fond filet, texte encre gras, coins 6 px ; fond surface et filet bleu doux sur une carte « À vous »), jamais en bleu.
- **Ligne de tâche** : numéro en mono, titre, état en gris ; une seule ligne, détail au clic.
- **Liste des projets** : colonne de 240 px collée au bord droit (au-delà de 900 px de large), fond un ton à côté du papier (surface 2 le jour, papier la nuit) et filet à gauche, titre « Projets » sans nombre ; un projet par ligne (44 px), par ordre alphabétique, nom coupé par « … ». Le projet ouvert : fond plus clair que la colonne (surface le jour, surface 2 la nuit), filet appuyé, coins 10 px, nom en gras (jamais de bleu). Sur téléphone, le nom du projet en haut ouvre la même liste en plein écran.
- **Point d'état** : rond de 8 px à gauche du nom, un seul par projet : rouge (bloqué), bleu signal (à vous de jouer), gris discret (en cours), rien sinon ; légende au survol. Sur téléphone, un point rouge ou bleu posé sur la flèche à côté du nom du projet signale qu'un **autre** projet vous attend.
- **Bandeau de nouvelle version** (#572) : quand une version plus récente du tableau de bord est en ligne, une bande pleine largeur sous la barre du haut (dans la barre : sur ordinateur elle reste collée en haut ; sur téléphone la barre défile avec la page et seule la bande reste collée en haut de l'écran, y compris au-dessus d'une conversation de l'onglet « Agent »), fond surface 2, filet d'un pixel au-dessus, texte encre en petit (13 px) : « Une nouvelle version du tableau de bord est disponible. », puis à droite le bouton discret « Recharger ». Jamais de bleu, pas de croix : il reste jusqu'au rechargement, un seul même si plusieurs versions arrivent. La page ne se recharge jamais d'elle-même ; si un réglage, un message ou une réponse de l'agent est en cours, « Recharger » ne recharge pas et un message bref dit quoi faire d'abord. Sur téléphone, le bouton passe sous le texte quand la place manque.

## 8. Do's and Don'ts

### Do
- Mettre ce qui attend une réponse en haut, en bleu, et le reste en gris.
- Écrire court, en français, au vouvoiement (« Répondez go »).
- Garder les transitions sous 200 ms, sans effet décoratif.
- Vérifier le contraste AA en clair et en sombre.

- Laisser chaque écran se passer d'explications : titres, libellés de boutons et de champs, messages d'erreur courts qui disent quoi faire, et une seule phrase courte sur un écran vide.

### Don't
- Ne pas écrire de paragraphe d'introduction, de texte « Comment ça marche », de sous-titre qui décrit l'écran, d'aide sous un champ dont le libellé suffit, d'info-bulle explicative, de tutoriel ou de visite guidée (sauf demande expresse du propriétaire).
- Ne pas faire un tableau de bord chargé façon outil d'entreprise.
- Ne pas utiliser le bleu pour de la décoration ni plus d'un appel principal par écran.
- Ne pas montrer de noms de fichiers, de branches ou de jargon technique au premier niveau.
- Ne pas infantiliser : pas de mascotte, pas d'humour appuyé, pas d'émojis décoratifs.
- Ne pas utiliser de dégradés, d'ombres fortes ni de bordures colorées latérales.

## Issue 123 additions
- **Téléphone** : en haut, seulement le nom du projet, l'état du site en ligne (« En ligne : à jour », « En ligne : 2 modifications d'écart »… sur une ligne discrète, en rouge quand la dernière publication a échoué), « Nouvelle fonctionnalité », « Plus » (menu qui replie les actions secondaires) puis la carte « À vous ». Sur un projet mis en production « sur accord », « Mise en production » prend la place de « Nouvelle fonctionnalité », qui devient la première ligne de « Plus » : toujours une seule ligne de boutons, le « go » ne bouge jamais. Sur ordinateur tout reste affiché.
- **« go » immédiat** (#450) : un toucher envoie la réponse tout de suite ; le bouton affiche « Envoi… » le temps de l'envoi, puis « Envoyé ✓ » (gris, désactivé) jusqu'à ce que la carte change de colonne (#517), sans compte à rebours ni fenêtre de confirmation. « Jeter » sur une idée part aussi au toucher.
- **Carte « Prise en compte en cours… »** (#517) : la ligne du haut dit depuis quand la réponse attend (« envoyé à l'instant », « envoyé il y a 3 min »), sous la ligne du type, au lieu du temps passé à l'étape.
- **Chargement** : cartes grises calmes, sans animation. **Erreur de discussions** : message permanent + « Réessayer ».

## Issue 460 additions (onglet Agent)
- **Largeur (issue 473, remplace « pleine largeur »)** : l'onglet « Agent » a la largeur des autres onglets. Un bouton à deux flèches en haut de la conversation (infobulle « Plein écran » / « Largeur normale ») le passe en plein écran : seuls la barre du haut et la liste des projets restent visibles, le cadre colle aux bords (ni marge ni coins arrondis). On en sort par le même bouton ou Échap ; jamais mémorisé, et absent sur téléphone. Les messages restent dans une colonne de lecture de 860 px au plus, centrée. La conversation occupe exactement la hauteur restante de l'écran : la zone de saisie est toujours visible.
- **Messages** : ceux du propriétaire dans une bulle bleu doux (fond `#eaf0ff`, filet `#b9cbfa` ; nuit `#16213f` / `#2c437f`) à droite ; ceux de l'agent sans bulle, comme un texte de document. Le bleu doux n'est pas un appel à l'action : la règle « une seule voix » vaut toujours pour le bleu vif.
- **Encadrés colorés** (exception assumée à « tout est gris ») : une ligne de l'agent qui commence par ⚠️ (orange doux `#fff4e5`, filet `#f3c58f`), ✅ (vert doux `#ebf6ef`, filet `#a9d8bc`) ou ➡️ (bleu doux). Filet d'un pixel tout autour, jamais de bordure latérale ; l'émoji reste visible, la couleur n'est jamais seule.
- **Copier** : bouton discret (icône + « Copier ») en haut à droite d'un bloc de commande, et « Copier la réponse » sous chaque réponse ; « Copié ✓ » (vert) ou « Copie impossible » pendant 2 s.
- **Attente** : « Réfléchit… 0:42 · d'habitude, environ 1 à 2 min », chiffres en mono.
- **Image agrandie** : par-dessus la page sur un voile sombre (`rgb(0 0 0 / .8)`, plus opaque que le voile habituel pour isoler l'image) ; Échap, un clic à côté ou le bouton × la referme.

## Mises en page

### Projet (en-tête commun aux onglets)
- **Disposition générale** : barre du haut (logo « Factory » à gauche, boutons discrets à droite : « Outils Mac », « Déclarer stable » (visible seulement quand de vraies modifications attendent d'être déclarées stables, leur nombre entre parenthèses en mono), « Sur mon téléphone », « Réglages généraux », « Se déconnecter » en dernier), puis le nom du projet en grand titre, une ligne grise d'état (privé ou public, demandes en parallèle), une ligne de liens discrets en petit (13 px) séparés par « · » (site en ligne, demandes sur GitHub, agents du jour), la rangée de boutons d'action (« Nouvelle fonctionnalité » en premier, détaché des autres), puis les onglets « Suivi », « Agent », « Paramètres ». Quand une nouvelle version du tableau de bord est en ligne, le bandeau de nouvelle version s'ajoute sous la barre du haut, sur tous les écrans (Réglages généraux et Agent en plein écran compris).
- **Sommaire ou navigation** : les onglets soulignés en encre ; la liste des projets, colonne de 240 px collée au bord droit, sert à changer de projet.
- **Largeur** : contenu de 1100 px au plus, aligné à gauche de l'espace laissé par la liste des projets.
- **Libellés et explications** : aucun texte d'explication ; seuls les titres, les libellés des boutons et la ligne d'état.
- **Volets repliables** : aucun.
- **Sur téléphone** : la liste des projets disparaît ; le nom du projet en haut, avec sa flèche, l'ouvre en plein écran. Les boutons se réduisent à « Nouvelle fonctionnalité » (ou « Mise en production ») et « Plus », qui replie les autres actions, dont « Réglages généraux » ; cette ligne prend toute la largeur. Les onglets restent sur une ligne.
- **Écrans concernés** : Suivi, Agent, Paramètres (leur partie haute).

### Tableau de suivi (onglet « Suivi »)
- **Disposition générale** : une colonne de sections empilées, chacune avec son titre et son nombre en puce mono : d'abord « À vous de jouer » (ou la carte calme « Aucune fonctionnalité en cours » avec le point « En direct »), puis les agents au travail, la file d'attente, les idées à trier et « Terminé ». Dans chaque section, une grille de cartes de même taille (280 px au moins chacune, autant par ligne que la largeur le permet).
- **Sommaire ou navigation** : aucun ; l'ordre des sections est fixe, ce qui attend une réponse toujours en haut.
- **Largeur** : la largeur du contenu du projet (1100 px au plus).
- **Libellés et explications** : le titre de section et son nombre ; une section vide dit une seule phrase dans un cadre en pointillés (« Rien de livré pour l'instant. »).
- **Volets repliables** : les cartes « Mise en production » repliables (liste des modifications) ; le reste est ouvert.
- **Boutons des cartes** : petits (32 px visibles, 44 px sous le doigt) sur toutes les cartes : « go » / « Ok » et « Voir… » des cartes « À vous », boutons des cartes en attente, « Garder » / « Jeter » des idées.
- **Sur téléphone** : une carte par ligne, la carte « À vous » en tête ; les boutons d'une carte gardent leur petite taille, côte à côte.
- **Écrans concernés** : Suivi.

### Page de réglages (onglet « Paramètres »)
- **Disposition générale** : un titre « Ce projet : <nom> », puis une suite de blocs encadrés (cadre surface, filet d'un pixel, coins arrondis) avec leur titre posé sur le cadre : Mise en production, Site en ligne, Étapes, Demandes en parallèle. Dans un bloc, un réglage par ligne, séparé du suivant par un filet. Les réglages techniques sont rangés tout en bas, sous « Avancé » (où le lien « Changer le réglage de tous les projets », vers la page « Réglages généraux », se trouve juste après le choix de machine propre au projet). Le dernier bloc d'« Avancé », « Savoir-faire », a une ligne par ensemble : sa case, son nom, le nombre de savoir-faire choisis (« 3 sur 15 ») et le volet « Choisir les savoir-faire ». Une barre « Enregistrer » avec l'état (« Tout est enregistré ») reste collée en bas de l'écran quand on fait défiler.
- **Sommaire ou navigation** : aucun ; l'ordre des blocs suit l'importance.
- **Largeur** : la largeur du contenu du projet ; les champs texte prennent toute la largeur du bloc, les champs nombre sont courts.
- **Libellés et explications** : libellé en gras au-dessus du champ, ou à droite de la case à cocher ou du bouton radio (toute la ligne coche la case) ; un réglage qui dépend d'un autre est décalé en dessous de lui, en gris. Pas d'aide sous les champs.
- **Volets repliables** : « Avancé », replié par défaut, avec une ligne de résumé grise sous son titre (« Serveur de dev · 7 contrôles sur 7 · … ») ; dans « Savoir-faire », « Choisir les savoir-faire » de chaque ensemble, ouvert d'office quand il en compte 3 au plus.
- **Sur téléphone** : mêmes blocs sur une colonne, pleine largeur.
- **Écrans concernés** : Paramètres.

### Réglages généraux (page à part)
- **Disposition générale** : ouverte par le bouton « Réglages généraux » de la barre du haut (ou par le lien « Changer le réglage de tous les projets » des Paramètres), elle remplace l'écran du projet (en-tête, onglets et panneaux disparaissent). En haut, le bouton-lien « ← Retour au projet », puis le titre « Réglages généraux », puis deux blocs encadrés comme ceux de « Paramètres » : « Modèles » (une ligne par rôle : son nom, une phrase d'aide grise, une liste de choix) et « Machine des tâches » (deux boutons radio). La même barre « Enregistrer » avec son état reste collée en bas.
- **Chargement** : la page s'ouvre aussitôt ; pendant la lecture des réglages, les blocs sont remplacés par le seul mot gris « Chargement… », sans autre texte. Le bouton du haut garde son libellé et sa largeur.
- **Sommaire ou navigation** : le lien de retour ramène au projet tel qu'on l'a laissé (même onglet) ; aucun autre sommaire. Tant que la page est ouverte, le bouton « Réglages généraux » de la barre du haut paraît enfoncé (fond surface, filet encre, trait intérieur en bas ; jamais en gras, la barre ne bouge pas).
- **Largeur** : celle du contenu du projet ; les listes de choix de 420 px au plus.
- **Libellés et explications** : le nom du rôle en gras, sa phrase d'aide en gris dessous, puis la liste ; sous les quatre rôles, un court paragraphe gris dit que le modèle de l'agent qui pilote se règle sur claude.ai.
- **Volets repliables** : aucun.
- **Sur téléphone** : une seule colonne, blocs et listes de choix pleine largeur ; le bouton d'ouverture se range dans « Plus » avec les autres.
- **Écrans concernés** : Réglages généraux.

### Discussion (onglet « Agent »)
- **Disposition générale** : un grand cadre en deux colonnes qui occupe toute la hauteur restante de l'écran : à gauche (290 px, fond un ton à côté) « Nouvelle conversation » puis la liste des conversations ; à droite l'en-tête de la conversation (titre, bouton plein écran), les messages, et la zone de saisie toujours visible en bas (image, champ, envoi).
- **Sommaire ou navigation** : la liste des conversations à gauche.
- **Largeur** : la largeur des autres onglets ; les messages dans une colonne de lecture de 860 px au plus, centrée. Plein écran sur demande (voir « Issue 460 additions »).
- **Libellés et explications** : une conversation vide montre un titre et trois exemples de messages à toucher, centrés ; rien d'autre.
- **Volets repliables** : les propositions de demande dans une réponse (détail repliable).
- **Sur téléphone** : une seule colonne : la liste des conversations, puis la conversation ouverte à sa place ; pas de plein écran.
- **Écrans concernés** : Agent.

### Page d'accueil réduite (connexion, aucun projet)
- **Disposition générale** : une seule carte centrée, titre, une phrase au plus, puis le champ et le bouton.
- **Sommaire ou navigation** : aucun.
- **Largeur** : 560 px au plus, centrée.
- **Libellés et explications** : libellé au-dessus du champ ; message d'erreur court sous le champ.
- **Volets repliables** : aucun.
- **Sur téléphone** : la carte prend toute la largeur, marges de 16 px.
- **Écrans concernés** : connexion à GitHub, « Aucun projet pour l'instant », jeton de lecture de la discussion.

### Fenêtre (par-dessus le projet)
- **Disposition générale** : une fenêtre centrée sur le voile : titre en haut, contenu, puis les boutons en bas à droite (l'action principale en dernier).
- **Sommaire ou navigation** : aucun ; Échap ou « Fermer » la referme.
- **Largeur** : selon le contenu : 380 px (code QR), 640 px (stack technique, mise en production, pas encore en ligne), toujours la largeur de l'écran moins 32 px au plus.
- **Libellés et explications** : titre court ; le texte de la fiche lue en 65 caractères par ligne au plus.
- **Volets repliables** : aucun.
- **Sur téléphone** : presque plein écran, marges de 16 px, le contenu défile et les boutons restent en bas.
- **Écrans concernés** : Ouvrir sur votre téléphone, Stack technique, Mettre en production, Pas encore en ligne, liste des projets (téléphone), image agrandie.
