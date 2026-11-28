# 628 · Réduire et mesurer la consommation de tokens de la factory

> Demande [#628](https://github.com/phoibe/factory/issues/628) · 2026-11-28

**En une phrase** : une nouvelle page « Consommation », ouverte depuis les Réglages généraux, montre pour tous vos projets ensemble ce que consomme chaque type de tâche de la factory, moteur par moteur et effort par effort, en équivalent dollars et en part estimée de vos deux jauges de forfait.

C'est la première des deux livraisons prévues. La seconde (mode économe, effort réglable, skills inutiles écartées) a sa propre demande : voir « Ensuite ».

### Ce que j'ai décidé pour vous
- La page a un filtre « Taille » (toutes les demandes, petites, moyennes, grandes) : c'est lui qui permet de comparer à taille égale. Les bugs, les reviews générales, les améliorations UI et les cadrages n'ont pas de taille : ils ne comptent que dans « Toutes les demandes ».
- Chaque ligne du tableau se déplie d'un toucher pour montrer ce qu'elle contient, avec les mêmes colonnes. Une dernière ligne « Total » additionne tout.
- Sur « 30 derniers jours », les deux colonnes de forfait donnent la moyenne par semaine (une semaine de forfait ne peut pas contenir 30 jours).
- Vous saisissez la remise à zéro de chaque jauge, telle que claude.ai l'affiche sous chacune : elles peuvent tomber à des moments différents. Les périodes de la page suivent celle de la jauge « tous moteurs ».
- Dans un relevé, le champ « Fable » peut rester vide. Le dernier relevé peut être supprimé, en cas de faute de frappe.
- Un étalonnage dont le second relevé a moins de 3 heures est marqué « provisoire » : la mesure d'un lancement n'arrive qu'à sa fin, le chiffre peut donc encore bouger.
- Le tarif public utilisé est affiché en bas de la page avec sa date. Il est noté pour chaque version de moteur, et la mise à jour mensuelle de la factory (celle qui repère déjà les nouvelles versions) le relève aussi. Tant qu'une version n'a pas de tarif connu, ses lignes montrent les tokens et « tarif inconnu », jamais un chiffre faux.
- La factory est mesurée dès la livraison. Vos autres projets le sont dès qu'ils reçoivent cette version, c'est-à-dire quand vous la déclarez stable.
- La construction de cette demande enregistre sa propre mesure : la page de la preview ne sera donc pas vide.
- Les mesures de plus de 3 mois sont effacées : la page ne remonte jamais au-delà de 30 jours.
- Sur téléphone, le tableau défile de gauche à droite dans son cadre, sans faire déborder la page.
- Le document de design est mis à jour avec cette nouvelle page et son tableau de chiffres.

### Parcours

**1. Ouvrir la page.** Dans les Réglages généraux, sous le bloc « Modèles », un lien « Voir la consommation ». Il ouvre la page « Consommation », qui remplace les Réglages généraux, avec en haut le lien « ← Retour aux réglages généraux ». Même présentation que les Réglages généraux : un titre, des blocs encadrés, des chiffres alignés, aucun graphique. Pendant la lecture des chiffres, le seul mot « Chargement… ». Des réglages modifiés mais pas encore enregistrés sont conservés au retour.

**2. Choisir la période et la taille.** En haut de la page, deux listes :
- « Période » : « Semaine de forfait en cours », « Semaine de forfait précédente », « 30 derniers jours ». Tant que vous n'avez pas saisi votre remise à zéro : « 7 derniers jours » et « 30 derniers jours ».
- « Taille » : « Toutes les demandes », « Petites », « Moyennes », « Grandes ».

**3. Lire le tableau.** Les types de tâche sont dans l'ordre des Réglages généraux : Plans et organisation, Écriture du code, Revue, Relectures d'une review générale, Tâches simples, puis « Agent qui pilote ». Pour chaque type, une ligne par couple moteur et effort réellement utilisé sur la période. Exemple, avec des chiffres inventés :

| Type de tâche | Moteur · effort | Tâches | Total | En moyenne | Semaine Fable | Semaine tous moteurs |
| --- | --- | --- | --- | --- | --- | --- |
| Revue | Fable · élevé | 14 | 58 $ | 4,10 $ | ≈ 9 % | ≈ 3 % |
| Revue | Opus · élevé | 6 | 11 $ | 1,80 $ | 0 % | ≈ 0,6 % |
| Écriture du code | Opus · moyen | 41 | 96 $ | 2,30 $ | 0 % | ≈ 5 % |
| Agent qui pilote | Opus · moyen | 52 | 31 $ | 0,60 $ | 0 % | ≈ 1,6 % |
| **Total** | | 113 | 196 $ | | ≈ 9 % | ≈ 10 % |

- « Tâches » : le nombre d'agents lancés (pour « Agent qui pilote » : le nombre de lancements).
- « Total » : l'équivalent en dollars au tarif public, avec le nombre de tokens en petit dessous (par exemple « 41 M de tokens »).
- « En moyenne » : le coût moyen d'une tâche. En dessous de 5 tâches, la case affiche « trop peu de mesures ».
- « Semaine Fable » et « Semaine tous moteurs » : la part estimée de chaque jauge, toujours précédée de « ≈ ». Une ligne qui n'utilise pas Fable affiche « 0 % » dans la colonne Fable. Une colonne n'apparaît qu'une fois sa jauge étalonnée (étape 7).

**4. Déplier une ligne.** Un toucher sur une ligne montre ce qu'elle contient :
- Plans et organisation : questions et fiche, plan, analyse d'un bug, cadrage d'un projet, autres.
- Écriture du code : construction, relectures de tâche, critique du design, corrections après relecture, corrections après vos retours (captures, recette), corrections après les contrôles automatiques, autres.
- Revue : relecture finale, relectures 2 et 3, vérification de portée, revue de sécurité, review générale, autres.
- Relectures d'une review générale : code partie par partie, historique du projet.
- Tâches simples : recherches, captures, autres.
- Agent qui pilote : questions et fiche, construction, corrections, review générale et amélioration UI, autres.

**5. Comparer deux réglages.** Vous changez un moteur dans les Réglages généraux, par exemple la Revue de Fable à Opus. La factory continue de travailler, et le tableau garde les deux lignes côte à côte : « Revue · Fable · élevé » et « Revue · Opus · élevé ». La comparaison se lit dans la colonne « En moyenne », avec le filtre « Taille » sur une seule taille, et en regardant aussi les lignes « corrections » du type « Écriture du code » : si un moteur moins cher laisse passer plus de défauts, c'est là que cela se voit.

**6. Bloc « Mon forfait » : la remise à zéro et les relevés.** Sous le tableau, un bloc « Mon forfait » :
- « Remise à zéro de la semaine » : pour « Tous moteurs » et pour « Fable », un jour et une heure, à recopier depuis claude.ai (Paramètres → Utilisation), puis « Enregistrer ». À saisir une seule fois.
- « Nouveau relevé » : deux champs, « Tous moteurs (%) » et « Fable (%) », à recopier depuis la même page de claude.ai, puis « Noter le relevé ». Le relevé prend l'heure à laquelle vous le notez.
- S'il existe déjà un relevé dans la même semaine de forfait, la page demande avant d'enregistrer : « Avez-vous utilisé Claude en dehors de la factory depuis le relevé précédent ? » avec « Oui » et « Non ». Dessous, en gris : « En dehors de la factory : vos discussions sur claude.ai, vos propres sessions, vos tâches planifiées et l'onglet « Agent ». »
- Le dernier relevé reste affiché avec sa date et son heure, et « Supprimer ce relevé ».

**7. L'étalonnage.** Pour étalonner : vous notez un relevé, vous laissez la factory travailler sans utiliser Claude ailleurs le temps d'une ou deux constructions, puis vous notez un second relevé en répondant « Non ».
- La factory sait ce qu'elle a consommé entre les deux relevés : elle en déduit ce que vaut 1 % de chaque jauge. Le bloc affiche alors, par exemple : « Étalonnage du 28 nov. · 1 % de la semaine tous moteurs ≈ 19 $ · 1 % de la semaine Fable ≈ 6 $ ».
- Les deux colonnes de forfait apparaissent dans le tableau.
- Si une jauge a monté de moins de 5 points : « La jauge tous moteurs a monté de 3 points depuis le relevé précédent : il en faut au moins 5 pour étalonner. Laissez la factory travailler, puis notez un nouveau relevé. » Le premier relevé reste le point de départ.
- Si vous répondez « Oui » : le relevé ne sert pas à l'étalonnage, il devient le point de départ du suivant.
- Tant qu'aucun étalonnage n'est fait, le bloc affiche « Pas encore d'étalonnage » et la page ne montre que les dollars.

**8. Le partage de votre semaine.** Une fois l'étalonnage fait, chaque relevé, même noté après avoir utilisé Claude ailleurs, affiche le partage de la semaine en cours : « Jauge tous moteurs à 43 % : factory ≈ 31 %, hors factory ≈ 12 % », et la même ligne pour Fable si sa jauge est étalonnée.

### Règles et cas limites
- **Ce qui est mesuré** : chaque lancement de l'agent, sur toutes les demandes de tous vos projets (fonctionnalités, bugs, reviews générales, améliorations UI, cadrages), à partir de la livraison. Chaque agent lancé est compté avec son type de tâche, son moteur et son effort. Rien pour les demandes passées. La discussion de l'onglet « Agent » n'est pas comptée.
- **Quand** : la mesure arrive à la fin de chaque lancement. Une demande en cours compte donc déjà ce qu'elle a consommé, et les relances et corrections sont rangées dans leur propre ligne. La page lit les chiffres quand vous l'ouvrez ; elle ne se met pas à jour toute seule.
- **Lancement coupé net** (panne, délai dépassé) : sa mesure peut manquer. Les totaux sont alors un peu en dessous de la réalité.
- **Le tarif** distingue quatre sortes de tokens : neufs, mis en mémoire, relus depuis la mémoire, écrits. Une précision sur ce que je vous ai écrit plus haut : au tarif public d'aujourd'hui, Fable coûte deux fois le prix d'Opus pour les tokens neufs, mis en mémoire et écrits, mais le même prix pour les tokens relus depuis la mémoire, qui font l'essentiel du volume. L'écart réel entre Fable et Opus sera donc inférieur à deux fois ; la page donnera le vrai chiffre.
- **Ce n'est pas une facture** : sous le tableau, une ligne grise le rappelle, avec la date du tarif (« Équivalent au tarif public de Claude du 3 nov. 2026. Ce n'est pas une facture. »).
- **L'étalonnage** part du plus ancien relevé de la semaine depuis lequel vous avez toujours répondu « Non ». Un nouvel étalonnage remplace le précédent. Il reste valable d'une semaine à l'autre : vous ne le refaites que de temps en temps, ou si Claude change les limites de votre forfait.
- **Deux relevés de part et d'autre d'une remise à zéro** ne servent pas à l'étalonnage (la page le voit à l'heure saisie, ou à une jauge qui a baissé) : le second devient le point de départ.
- **Fable peu utilisé** entre les deux relevés (moins de 5 points, ou champ vide) : seule la jauge « tous moteurs » est étalonnée, et seule sa colonne apparaît. La jauge Fable le sera à un prochain étalonnage.
- **La factory n'a rien consommé** entre les deux relevés : pas d'étalonnage, la page le dit.
- **Un usage oublié** en répondant « Non » fausse l'étalonnage, toujours dans le même sens (la factory paraît peser plus) : il suffit de le refaire. Si la part de la factory calculée dépasse la jauge relevée, la page affiche « L'étalonnage est peut-être à refaire. »
- **Saisie** : un relevé est un nombre entier de 0 à 100. Sinon : « Entrez un nombre entre 0 et 100. » Tant que la remise à zéro n'est pas enregistrée, « Noter le relevé » reste grisé.
- **Très petite part** : en dessous de 0,1 %, la case affiche « < 0,1 % ».
- **Page vide** : « Aucune mesure pour l'instant. Les chiffres arrivent à la fin du prochain lancement de la factory. »
- **Un projet illisible** : la page affiche les autres et dit lequel manque (« Les chiffres de <projet> n'ont pas pu être lus. »).
- **Rien d'autre ne change** : vos moteurs, les efforts, la passe design, les captures et les trois tours de relecture restent comme aujourd'hui.

### Où sont rangés les chiffres
- Les mesures de chaque projet sont rangées dans ce projet : celles d'un projet privé restent privées. Celles de la factory, qui est un projet public, sont visibles comme le reste de son historique. Elles ne contiennent que des nombres, des dates, des types de tâche et des noms de moteurs : aucun texte de vos demandes.
- Vos relevés de forfait, vos remises à zéro et l'étalonnage sont rangés avec vos Réglages généraux, pour que la page soit la même sur ordinateur et sur téléphone. Ces réglages sont dans le projet factory, donc publics : quelqu'un qui irait les chercher sur GitHub pourrait y lire vos pourcentages de forfait, comme il peut déjà y lire vos choix de moteurs. Aucun nom de projet privé n'y figure.
- Si vous préférez que ces relevés ne soient pas publics, dites-le : ils resteront alors dans le navigateur où vous les saisissez, et l'étalonnage sera à refaire sur chaque appareil.

### Hors périmètre
- Le mode économe, l'effort réglable et le retrait des skills inutiles (seconde livraison).
- La lecture automatique de vos jauges sur claude.ai.
- La consommation carte par carte ou demande par demande, et la liste des demandes les plus coûteuses.
- La consommation de l'onglet « Agent » et celle des demandes passées.
- La limite de 5 heures de votre forfait, et toute alerte quand une jauge approche de sa limite.
- Refaire le même travail sur deux moteurs pour les comparer.
- Les graphiques.

### Ensuite
Ensuite : une seconde demande, ouverte à la suite de celle-ci, apporte le mode économe (un interrupteur dans les Réglages généraux), le réglage de l'effort pour chaque type de tâche, et le retrait du module générique et des skills de votre compte des lancements de la factory. Elle se construira après la livraison de celle-ci, pour que son effet se lise dans les chiffres.

### Comment vérifier (sur la preview)
1. Dans les Réglages généraux, sous le bloc « Modèles », le lien « Voir la consommation » ouvre la page ; « ← Retour aux réglages généraux » y ramène.
2. La page montre un tableau avec au moins les lignes de la construction de cette demande : type de tâche, moteur et effort, nombre de tâches, total en dollars avec les tokens en petit, moyenne, et la ligne « Total ».
3. Une ligne qui compte moins de 5 tâches affiche « trop peu de mesures » à la place de la moyenne.
4. Un toucher sur une ligne « Revue » la déplie : relecture finale, relectures 2 et 3, vérification de portée…
5. Les listes « Période » et « Taille » changent les chiffres ; sans remise à zéro saisie, la période propose « 7 derniers jours » et « 30 derniers jours ».
6. Dans « Mon forfait », saisissez la remise à zéro et enregistrez : la période propose maintenant « Semaine de forfait en cours » et « Semaine de forfait précédente ».
7. Notez un relevé, puis un second : la page vous demande si vous avez utilisé Claude en dehors de la factory. Avec « Non » et moins de 5 points d'écart, elle dit qu'il en faut au moins 5.
8. Tapez « 150 » dans un relevé : la page le refuse. Supprimez le dernier relevé : il disparaît.
9. Tant qu'il n'y a pas d'étalonnage, le tableau ne montre que les dollars. Après un vrai étalonnage (deux relevés à une soirée d'écart, sans utiliser Claude ailleurs), le bloc affiche ce que vaut 1 % de chaque jauge et les colonnes de forfait apparaissent.
10. Sur téléphone, la page tient sur une colonne et le tableau défile de gauche à droite sans faire déborder la page.
11. Après la livraison, lancez n'importe quelle demande : à la fin de chaque lancement, ses lignes s'ajoutent quand vous rouvrez la page.
