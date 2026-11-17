# 447 · Toujours écrire en français le titre des fiches créées par les agents

> Demande [#447](https://github.com/phoibe/factory/issues/447) · 2026-11-17

**En une phrase** : toute fiche ouverte par un agent (idée repérée, sujet de revue générale, tranche d'une grosse demande, premières fiches d'un projet) a toujours son titre et son texte en français.

### Ce que j'ai décidé pour vous
- La règle est écrite une seule fois dans les consignes communes à tous les projets, et rappelée dans chaque étape où un agent ouvre des fiches (revue générale, découpage d'une grosse demande, cadrage d'un projet, chat).
- La règle « en anglais » reste réservée au code, aux noms techniques et aux commits, et le dit explicitement pour lever l'ambiguïté.
- Un test automatique vérifie que cette consigne est bien présente dans les consignes envoyées aux projets : si quelqu'un la retire par erreur, les contrôles échouent.
- Les fiches déjà créées avec un titre anglais ne sont pas renommées (hors périmètre).

### Ce qui change
Les agents ne pourront plus ouvrir de fiche avec un titre en anglais : les nouvelles cartes du tableau auront toutes un titre français.

### Comment vérifier
- Après la livraison, les prochaines idées proposées par un agent (colonne « Idées à trier ») et les tranches d'une grosse demande ont un titre en français.
- Les contrôles automatiques de la PR passent, dont le nouveau test sur cette consigne.
