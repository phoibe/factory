# 381 · Adapter le parcours à la taille de la demande

> Demande [#381](https://github.com/phoibe/factory/issues/381) · 2026-11-13

**En une phrase** : la factory adapte son parcours à la taille de chaque demande, pour qu'une petite retouche soit livrée plus vite, avec les mêmes garanties de qualité.

### Ce qui change pour vous

1. **Dès la première lecture d'une demande**, l'agent la classe en petite, moyenne ou grande. Le tableau affiche cette taille (et l'estimation de durée) comme aujourd'hui, mais plus tôt : dès les questions, plus seulement au début de la construction.
2. **Vous pouvez corriger la taille** en écrivant dans la demande, par exemple « c'est une grosse demande » ou « c'est une petite retouche ». L'agent suit alors votre classement.
3. **Petite demande claire** (elle dit déjà exactement quoi faire, ex. « renommer l'onglet X en Y ») : aucune question. L'agent écrit une spec courte et la construction démarre dans la foulée. Au moindre doute sur ce que vous voulez, il pose ses questions comme d'habitude.
4. **Spec courte** pour une petite demande : quelques lignes seulement, « ce qui change » et « comment le vérifier ».
5. **Construction selon la taille** :
   - petite : sans plan écrit, d'une traite, une seule relecture finale (déjà le cas aujourd'hui) ;
   - moyenne : un plan écrit, puis l'agent l'exécute lui-même d'une traite, avec une seule relecture finale (aujourd'hui, chaque tâche est confiée à un assistant différent et relue séparément) ;
   - grande : inchangé (tâche par tâche, chacune relue).
6. **Une petite demande qui grossit** (plus de 3 fichiers de code touchés en cours de route) : l'agent passe au parcours moyen, écrit le plan avant d'ouvrir la PR et met à jour la taille affichée, sans vous déranger.

### Ce qui ne change pas

- La relecture finale reste faite par le modèle le plus fort, quelle que soit la taille.
- Tests écrits avant le code, contrôles automatiques, passe design, captures et recette restent obligatoires pour toutes les tailles.
- Les demandes sensibles (données, sécurité, argent…) vous sont toujours soumises avant la construction, même petites.

### Le journal de fabrication

Dans chaque PR, le journal indique le parcours suivi (ex. « petite demande : sans plan », « moyenne : plan exécuté d'une traite ») : vous voyez pourquoi une étape n'y figure pas. Le contrôle qui refuse d'ouvrir une PR quand une étape manque tient compte de ce parcours : il exige toujours les tests, la relecture finale et la passe design, mais n'exige plus le plan pour une petite demande ni la relecture tâche par tâche pour une moyenne.

### Hors périmètre

- Les étapes de cadrage d'un nouveau projet et les revues générales ne changent pas.
- Pas de nouveau bouton dans le tableau pour changer la taille : on l'écrit dans la demande.

### Comment vérifier

- Sur une prochaine petite demande claire (ex. renommer un libellé) : pas de tour de questions, une spec de quelques lignes, puis une PR sans plan, avec le journal qui indique « petite demande ».
- Sur cette demande-ci et les suivantes, la taille apparaît sur la carte du tableau dès les questions.
- En écrivant « c'est une grosse demande » sur une demande classée petite, la taille affichée change et l'agent suit le parcours complet.
- Sur une demande moyenne : la PR contient un plan, et le journal montre une seule relecture finale par le modèle le plus fort.
- Les captures, contrôles et recette apparaissent comme d'habitude dans chaque PR.
