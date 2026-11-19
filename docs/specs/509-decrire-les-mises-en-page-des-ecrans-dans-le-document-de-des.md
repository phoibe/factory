# 509 · Décrire les mises en page des écrans dans le document de design

> Demande [#509](https://github.com/phoibe/factory/issues/509) · 2026-11-19

**En une phrase** : le document de design d'un projet peut décrire, en plus du thème, la mise en page de chaque type d'écran ; il reste à jour à chaque livraison, et un projet qui reprend le design d'un autre (Pulsar Novae et Pulsar Magnetar d'après Pulsar Wheel) suit les mises en page de ce projet de référence sans jamais les modifier.

### Ce que j'ai décidé pour vous
- Le tableau de suivi de la factory reçoit lui aussi sa partie « Mises en page », dans la même livraison.
- Un design repris d'un autre projet n'y reste pas lié : si Pulsar Wheel change plus tard, Pulsar Magnetar ne bouge pas tout seul ; vous lui demandez de recopier la référence quand vous le voulez.

### Ce qui change, étape par étape

**1. Une partie « Mises en page » dans chaque document de design**
- À côté du thème (couleurs, polices, formes, espacements, composants), le document gagne une partie « Mises en page ».
- Une sous-partie par type d'écran (configuration, tableau de bord, liste, détail…), écrite en mots, toujours avec la même grille : disposition générale, sommaire ou navigation, largeur, place des libellés et des explications, volets repliables, ce qui change sur téléphone.
- Chaque sous-partie nomme les écrans réels qui suivent ce modèle. Pas de schéma ni de capture dans le document.
- Elle est écrite assez précisément (largeurs chiffrées, ordre exact des blocs) pour qu'un autre projet refasse la même page sans voir l'écran : c'est ce qui permet à Pulsar Wheel de servir de référence.
- Au démarrage d'un nouveau projet, le document est créé avec cette partie (vide tant qu'aucun écran n'existe, puis remplie au fil des constructions).

**2. Chaque construction tient le document à jour** (quand il a sa partie « Mises en page »)
- Quand une construction crée un écran disposé d'une façon nouvelle, elle ajoute sa mise en page au document dans la même livraison.
- Quand l'écran suit une mise en page déjà décrite, elle ajoute simplement son nom à la liste des écrans concernés.

**3. La relecture du design vérifie la mise en page**
- Elle juge désormais l'écran aussi sur sa mise en page, pas seulement sur les couleurs et les polices.
- Si le document est en retard (mise en page nouvelle non décrite), elle le complète elle-même et l'annonce dans la PR en une ligne : « Mise en page ajoutée au design : … ».
- Si l'écran contredit une mise en page déjà décrite, c'est l'écran qui est corrigé, pas le document.

**4. Reprendre le design d'un autre projet**
- Au cadrage d'un nouveau projet, la question sur le design propose une option claire : « Reprendre le design d'un de vos projets », avec la liste de vos projets.
- Si vous la choisissez, le nouveau projet reçoit le thème **et** toutes les mises en page de l'autre, à l'identique. Le questionnaire design ne sert plus qu'à ce que vous voulez changer.
- Son document de design dit en tête « Design repris de <projet> » : ses constructions suivent alors les mises en page de la référence et ne les modifient jamais avec ce qui est propre au projet. Un écran d'un genre absent de la référence est rangé sous la mise en page la plus proche, et la PR le signale pour que vous la demandiez dans le projet de référence.

**5. Les projets déjà lancés**
- Rien n'est lancé automatiquement sur tous les projets : vous choisissez, projet par projet.
- Pour le projet de référence (Pulsar Wheel), vous demandez « Décrire les mises en page des écrans » : la partie est écrite d'après ses écrans actuels, très précisément.
- Pour un projet qui doit suivre un autre (Pulsar Novae, Pulsar Magnetar), vous demandez qu'il suive Pulsar Wheel : son document reçoit la ligne « Design repris de Pulsar Wheel » et la copie exacte des mises en page de Wheel, jamais les siennes.
- Tant qu'un projet n'a pas cette partie, aucune construction ne la crée en passant.

### Règles et cas limites
- Un projet sans aucun écran (pas encore construit) a une partie « Mises en page » vide, pas inventée.
- Un écran qui mélange deux modèles est rangé sous le plus proche, avec une phrase sur ce qui diffère ; une vraie différence devient une nouvelle sous-partie.
- Si le projet de référence n'a pas encore sa partie « Mises en page », un projet qui la recopie s'arrête et vous demande de la faire d'abord dans la référence.

### Hors périmètre
- Modifier l'apparence des écrans existants pour les rendre plus cohérents (seul le document change ici).
- Garder deux projets synchronisés dans le temps.
- Schémas dessinés ou captures dans le document de design.

### Comment vérifier
1. Ouvrez le document de design de la factory : il contient une partie « Mises en page », avec une sous-partie par type d'écran du tableau de suivi, chacune avec la grille complète et la liste de ses écrans.
2. Après la fusion, aucune nouvelle demande n'apparaît d'elle-même dans vos projets. Demandez « Décrire les mises en page des écrans » dans Pulsar Wheel, puis, une fois livrée, « Suivre les mises en page de Pulsar Wheel » dans Pulsar Novae et Pulsar Magnetar : leur document reçoit la copie exacte de celui de Wheel.
3. Au prochain cadrage d'un projet, la question design propose « Reprendre le design d'un de vos projets » avec vos projets ; en la choisissant, le document du nouveau projet contient le thème et les mises en page de l'autre.
4. Sur la prochaine construction qui ajoute un écran disposé autrement, la PR met à jour la partie « Mises en page » ; si elle l'oublie, la relecture du design l'ajoute et l'écrit dans la PR.
