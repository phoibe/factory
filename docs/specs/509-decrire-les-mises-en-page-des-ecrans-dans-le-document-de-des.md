# 509 · Décrire les mises en page des écrans dans le document de design

> Demande [#509](https://github.com/phoibe/factory/issues/509) · 2026-11-19

**En une phrase** : le document de design de chaque projet décrit désormais, en plus du thème, la mise en page de chaque type d'écran ; il reste à jour à chaque livraison, et un projet qui reprend le design d'un autre retrouve aussi l'allure de ses pages.

### Ce que j'ai décidé pour vous
- Le tableau de suivi de la factory reçoit lui aussi sa partie « Mises en page », dans la même livraison.
- Un design repris d'un autre projet n'y reste pas lié : si Pulsar Wheel change plus tard, Pulsar Magnetar ne bouge pas tout seul.

### Ce qui change, étape par étape

**1. Une partie « Mises en page » dans chaque document de design**
- À côté du thème (couleurs, polices, formes, espacements, composants), le document gagne une partie « Mises en page ».
- Une sous-partie par type d'écran (configuration, tableau de bord, liste, détail…), écrite en mots, toujours avec la même grille : disposition générale, sommaire ou navigation, largeur, place des libellés et des explications, volets repliables, ce qui change sur téléphone.
- Chaque sous-partie nomme les écrans réels qui suivent ce modèle. Pas de schéma ni de capture dans le document.
- Au démarrage d'un nouveau projet, le document est créé avec cette partie (vide tant qu'aucun écran n'existe, puis remplie au fil des constructions).

**2. Chaque construction tient le document à jour**
- Quand une construction crée un écran disposé d'une façon nouvelle, elle ajoute sa mise en page au document dans la même livraison.
- Quand l'écran suit une mise en page déjà décrite, elle ajoute simplement son nom à la liste des écrans concernés.

**3. La relecture du design vérifie la mise en page**
- Elle juge désormais l'écran aussi sur sa mise en page, pas seulement sur les couleurs et les polices.
- Si le document est en retard (mise en page nouvelle non décrite), elle le complète elle-même et l'annonce dans la PR en une ligne : « Mise en page ajoutée au design : … ».
- Si l'écran contredit une mise en page déjà décrite, c'est l'écran qui est corrigé, pas le document.

**4. Reprendre le design d'un autre projet**
- Au cadrage d'un nouveau projet, la question sur le design propose une option claire : « Reprendre le design d'un de vos projets », avec la liste de vos projets.
- Si vous la choisissez, le nouveau projet reçoit le thème **et** toutes les mises en page de l'autre, à l'identique. Le questionnaire design ne sert plus qu'à ce que vous voulez changer.

**5. Les projets déjà lancés**
- La factory ouvre une demande dans chaque projet existant : « Décrire les mises en page des écrans ».
- Elle démarre seule, sans questions, décrit les écrans actuels et ne touche qu'au document de design, jamais aux écrans.
- Vous la validez comme une demande normale, en relisant le texte.

### Règles et cas limites
- Un projet sans aucun écran (pas encore construit) a une partie « Mises en page » vide, pas inventée.
- Un écran qui mélange deux modèles est rangé sous le plus proche, avec une phrase sur ce qui diffère ; une vraie différence devient une nouvelle sous-partie.
- La demande automatique n'est ouverte qu'une fois par projet : si le document a déjà sa partie « Mises en page », rien n'est ouvert.

### Hors périmètre
- Modifier l'apparence des écrans existants pour les rendre plus cohérents (seul le document change ici).
- Garder deux projets synchronisés dans le temps.
- Schémas dessinés ou captures dans le document de design.

### Comment vérifier
1. Ouvrez le document de design de la factory : il contient une partie « Mises en page », avec une sous-partie par type d'écran du tableau de suivi, chacune avec la grille complète et la liste de ses écrans.
2. Après la fusion, chaque projet déjà lancé a une nouvelle demande « Décrire les mises en page des écrans » qui démarre seule ; sa PR ne change que le document de design.
3. Au prochain cadrage d'un projet, la question design propose « Reprendre le design d'un de vos projets » avec vos projets ; en la choisissant, le document du nouveau projet contient le thème et les mises en page de l'autre.
4. Sur la prochaine construction qui ajoute un écran disposé autrement, la PR met à jour la partie « Mises en page » ; si elle l'oublie, la relecture du design l'ajoute et l'écrit dans la PR.
