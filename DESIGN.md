---
name: Factory
description: Un atelier monochrome, précis et aéré, où une seule couleur vive signale ce qui attend votre réponse.
colors:
  paper: "#fbfbfa"
  surface: "#ffffff"
  ink: "#0e0f11"
  muted: "#5f6368"
  line: "#e6e6e3"
  signal-blue: "#1850e8"
  signal-blue-soft: "#eaf0ff"
  ok-green: "#1a7f4b"
  danger-red: "#c62828"
  paper-dark: "#101113"
  surface-dark: "#18191c"
  ink-dark: "#f2f2ef"
  muted-dark: "#9aa0a6"
  line-dark: "#2a2c30"
  signal-blue-dark: "#6c93ff"
  signal-blue-soft-dark: "#16213f"
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
- **Bleu signal** (`#1850e8`, nuit `#6c93ff`) : uniquement la carte « À vous » et son bouton « go » (exception : le bouton de connexion). Les liens sont en encre soulignée, le bouton d'envoi de la discussion est encre. Fond doux associé (`#eaf0ff`, nuit `#16213f`).

### Neutral
- **Papier** (`#fbfbfa`, nuit `#101113`) : fond de page.
- **Surface** (`#ffffff`, nuit `#18191c`) : cartes.
- **Encre** (`#0e0f11`, nuit `#f2f2ef`) : texte.
- **Gris discret** (`#5f6368`, nuit `#9aa0a6`) : texte secondaire.
- **Filet** (`#e6e6e3`, nuit `#2a2c30`) : bordures d'un pixel.

### Status
- **Vert** (`#1a7f4b`) : terminé. **Rouge** (`#c62828`) : échec. Toujours accompagnés d'un mot ou d'une icône, jamais seuls.

**The One Voice Rule.** Le bleu apparaît sur un seul élément principal par écran : ce qui attend la réponse. S'il n'y a rien à répondre, il n'y a pas de bleu.

## 3. Typography

**Display / corps :** Geist (repli : police système sans empattement).
**Chiffres et identifiants :** Geist Mono pour les numéros de tâches, versions, durées.

- **Display** (600, 1.75rem, interligne 1.2, -0.02em) : titre d'écran.
- **Title** (600, 1.125rem) : titres de cartes.
- **Body** (400, 1rem, interligne 1.5) : texte, une courte phrase par ligne, 65 caractères maximum.
- **Label** (mono 500, 0.8125rem) : numéros, états, métadonnées.

**The Mono Numbers Rule.** Tout numéro (#33, 2 tâches, 3 min) est en police à chasse fixe.

## 4. Layout

Colonne unique sur téléphone, avec la carte « À vous » en haut ; largeur maximale de 1100 px sur ordinateur. Rythme sur une échelle de 4 / 8 / 16 / 24 / 48 px, de grandes marges entre sections (48 px) et des groupes serrés à l'intérieur. Les zones tactiles font au moins 44 px, placées sous le pouce en bas de la carte.

## 5. Elevation & Depth

Plat : la profondeur vient des filets d'un pixel et du contraste papier / surface, pas des ombres. Une ombre très légère (`0 1px 2px rgb(0 0 0 / .05)`) est permise uniquement sur les éléments flottants (menus).

## 6. Shapes

Coins doucement arrondis : 6 px (champs, puces), 10 px (boutons), 14 px (cartes). Pas de formes décoratives.

## 7. Components

- **Bouton principal** : fond bleu signal, texte blanc, 44 px de haut ; un seul par écran. Survol : légère variation de teinte. Focus : anneau de 2 px bleu avec 2 px de marge.
- **Bouton discret** : surface, filet, texte encre ; pour toutes les autres actions.
- **Carte** : surface, filet d'un pixel, coins 14 px, marge intérieure 24 px.
- **Carte « À vous »** : fond bleu doux, grande, en tête de page, avec le bouton « go ». Absente quand rien n'attend.
- **Ligne de tâche** : numéro en mono, titre, état en gris ; une seule ligne, détail au clic.

## 8. Do's and Don'ts

### Do
- Mettre ce qui attend une réponse en haut, en bleu, et le reste en gris.
- Écrire court, en français, au vouvoiement (« Répondez go »).
- Garder les transitions sous 200 ms, sans effet décoratif.
- Vérifier le contraste AA en clair et en sombre.

### Don't
- Ne pas faire un tableau de bord chargé façon outil d'entreprise.
- Ne pas utiliser le bleu pour de la décoration ni plus d'un appel principal par écran.
- Ne pas montrer de noms de fichiers, de branches ou de jargon technique au premier niveau.
- Ne pas infantiliser : pas de mascotte, pas d'humour appuyé, pas d'émojis décoratifs.
- Ne pas utiliser de dégradés, d'ombres fortes ni de bordures colorées latérales.

## Issue 123 additions
- **Téléphone** : en haut, seulement le nom du projet, « Nouvelle fonctionnalité », « Plus » (menu qui replie les actions secondaires) puis la carte « À vous ». Sur ordinateur tout reste affiché.
- **« go » annulable** : un toucher le transforme en « Annuler (5 s) » ; il part à 0, sans fenêtre de confirmation.
- **Chargement** : cartes grises calmes, sans animation. **Erreur de discussions** : message permanent + « Réessayer ».
